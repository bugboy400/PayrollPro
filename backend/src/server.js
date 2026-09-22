import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import PDFDocument from "pdfkit";
import { calculatePayroll } from "./services/payroll.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import {
  hashToken,
  randomToken,
  passwordHash,
  sanitizeAudit,
  changedFields,
} from "./enterprise.js";
import { sendSecurityEmail } from "./mail.js";
import { fileURLToPath } from "url";
import prismaPkg from "@prisma/client";

const {
  PrismaClient,
  Role,
  AttendanceStatus,
  AttendanceApprovalStatus,
  OvertimeStatus,
  LeaveStatus,
  PayrollStatus,
  ApprovalType,
  ApprovalStatus,
  PerformanceStatus,
  LeavePayment,
  PasswordTokenType,
  StatutoryScheme,
  StatutoryEnrollmentStatus,
  StatutoryBaseType,
  StatutoryRuleStatus,
} = prismaPkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const uploadDir = path.join(root, "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

const prisma = new PrismaClient();
const app = express();

const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production"
    ? ""
    : "local-development-secret-change-me");

if (process.env.NODE_ENV === "production" && JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}

const port = Number(process.env.PORT || 5000);
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

app.use(cors({ origin: clientUrl }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);

app.use("/uploads", express.static(uploadDir));

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_, file, cb) =>
    cb(
      null,
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}${path.extname(file.originalname).toLowerCase()}`,
    ),
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  fileFilter: (_, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG and WebP images are allowed"));
    }

    cb(null, true);
  },
});

const safeUser = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  activatedAt: true,
  employee: {
    include: {
      department: true,
      designation: true,
      branch: true,
    },
  },
};

const employeeInclude = {
  department: true,
  designation: true,
  branch: true,
  salary: true,
  user: {
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
    },
  },
};

const attendanceInclude = {
  employee: true,
  checkInRecordedBy: {
    select: {
      id: true,
      email: true,
      role: true,
    },
  },
  checkInApprovedBy: {
    select: {
      id: true,
      email: true,
      role: true,
    },
  },
  checkOutRecordedBy: {
    select: {
      id: true,
      email: true,
      role: true,
    },
  },
  checkOutApprovedBy: {
    select: {
      id: true,
      email: true,
      role: true,
    },
  },
};

async function sign(user, sessionId) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      sid: sessionId,
    },
    JWT_SECRET,
    {
      expiresIn: "12h",
    },
  );
}

function fail(res, status, message) {
  return res.status(status).json({
    error: message,
  });
}

function num(v) {
  return Number(v || 0);
}

function dateOnly(v) {
  const d = new Date(v);

  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date");
  }

  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a, b) {
  return Math.floor((dateOnly(b) - dateOnly(a)) / 86400000) + 1;
}

function clientIp(req) {
  return (
    req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || null
  );
}

async function audit(req, action, entity, entityId = null, metadata = {}) {
  req.auditRecorded = true;

  metadata = sanitizeAudit(metadata);

  await prisma.auditLog.create({
    data: {
      userId: req.user?.id ?? null,
      action,
      entity,
      entityId: entityId == null ? null : String(entityId),
      ipAddress: clientIp(req),
      metadata,
    },
  });
}

async function security(req, userId, action, metadata = {}) {
  await prisma.securityEvent.create({
    data: {
      userId,
      action,
      metadata,
      ipAddress: clientIp(req),
    },
  });
}

async function notify(userId, title, message, type = "INFO") {
  if (!userId) return;

  await prisma.notification
    .create({
      data: {
        userId,
        title,
        message,
        type,
      },
    })
    .catch(() => {});
}

async function auth(req, res, next) {
  const h = req.headers.authorization || "";

  if (!h.startsWith("Bearer ")) {
    return fail(res, 401, "Authentication required");
  }

  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);

    const u = await prisma.user.findUnique({
      where: {
        id: req.user.id,
      },
      select: {
        id: true,
        role: true,
        isActive: true,
        employeeId: true,
      },
    });

    if (!u || !u.isActive) {
      return fail(res, 401, "Account inactive");
    }

    if (req.user.sid) {
      const session = await prisma.session.findFirst({
        where: {
          id: Number(req.user.sid),
          userId: u.id,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      if (!session) {
        return fail(res, 401, "Session expired or revoked");
      }
    }

    req.user = u;

    if (!req._auditHook) {
      req._auditHook = true;

      res.on("finish", () => {
        if (
          !req.auditRecorded &&
          ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
          res.statusCode < 500
        ) {
          prisma.auditLog
            .create({
              data: {
                userId: u.id,
                action: `${req.method}_${req.path}`.slice(0, 190),
                entity: "SYSTEM_REQUEST",
                entityId: null,
                ipAddress: clientIp(req),
                metadata: {
                  status: res.statusCode,
                },
              },
            })
            .catch(() => {});
        }
      });
    }

    next();
  } catch {
    return fail(res, 401, "Invalid or expired token");
  }
}

function allow(...roles) {
  return (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : fail(res, 403, "You do not have permission for this action");
}

function isEmployee(req, employeeId) {
  return (
    req.user.role === Role.EMPLOYEE &&
    req.user.employeeId === Number(employeeId)
  );
}

function validTheme(theme) {
  return ["system", "light", "dark"].includes(theme);
}

function calculateWorkedDurationMinutes(row) {
  if (
    !row?.checkIn ||
    !row?.checkOut ||
    row.checkInStatus !== AttendanceApprovalStatus.APPROVED ||
    row.checkOutStatus !== AttendanceApprovalStatus.APPROVED
  ) {
    return null;
  }

  const diff = Math.floor(
    (new Date(row.checkOut).getTime() - new Date(row.checkIn).getTime()) /
      60000,
  );

  return Math.max(0, diff);
}

function validStatutoryScheme(value) {
  return ["SSF", "EPF"].includes(String(value || "").toUpperCase());
}

function validStatutoryBaseType(value) {
  return ["BASIC", "GROSS", "BASIC_PLUS_ALLOWANCES", "CUSTOM"].includes(
    String(value || "").toUpperCase(),
  );
}

function validEnrollmentStatus(value) {
  return [
    "PENDING",
    "APPLICABLE",
    "NOT_APPLICABLE",
    "EXEMPT",
    "SUSPENDED",
    "ENDED",
  ].includes(String(value || "").toUpperCase());
}

function decimal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function validateRate(value, field) {
  const n = Number(value);

  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`${field} must be between 0 and 100`);
  }

  return n;
}

async function getEffectiveStatutoryRules(year, month) {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 1);

  const rules = await prisma.statutoryConfig.findMany({
    where: {
      status: StatutoryRuleStatus.ACTIVE,
      effectiveFrom: {
        lte: periodStart,
      },
      OR: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            gte: periodEnd,
          },
        },
      ],
    },
    orderBy: [
      {
        scheme: "asc",
      },
      {
        effectiveFrom: "desc",
      },
      {
        version: "desc",
      },
    ],
  });

  const byScheme = new Map();

  for (const rule of rules) {
    if (!byScheme.has(rule.scheme)) {
      byScheme.set(rule.scheme, []);
    }

    byScheme.get(rule.scheme).push(rule);
  }

  for (const [scheme, items] of byScheme.entries()) {
    if (items.length > 1) {
      throw new Error(
        `Multiple active ${scheme} statutory rules overlap the payroll period`,
      );
    }
  }

  return [...byScheme.values()].map((items) => items[0]);
}

async function getEmployeeStatutoryRules(employeeId, year, month) {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 1);

  const enrollments = await prisma.statutoryEnrollment.findMany({
    where: {
      employeeId,
      effectiveFrom: {
        lte: periodStart,
      },
      OR: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            gte: periodEnd,
          },
        },
      ],
    },
    orderBy: {
      effectiveFrom: "desc",
    },
  });

  const selected = new Map();

  for (const enrollment of enrollments) {
    if (!selected.has(enrollment.scheme)) {
      selected.set(enrollment.scheme, enrollment);
    }
  }

  for (const enrollment of selected.values()) {
    if (enrollment.status === StatutoryEnrollmentStatus.PENDING) {
      throw new Error(
        `Employee ${employeeId} has a pending ${enrollment.scheme} statutory enrollment`,
      );
    }
  }

  const activeRules = await getEffectiveStatutoryRules(year, month);

  const result = [];

  for (const scheme of ["SSF", "EPF"]) {
    const enrollment = selected.get(scheme);

    if (
      !enrollment ||
      enrollment.status !== StatutoryEnrollmentStatus.APPLICABLE
    ) {
      continue;
    }

    const rule = activeRules.find((item) => item.scheme === scheme);

    if (!rule) {
      throw new Error(
        `Employee ${employeeId} is applicable for ${scheme}, but no active statutory rule exists for the payroll period`,
      );
    }

    result.push({
      ...rule,
      enrollmentId: enrollment.id,
    });
  }

  return result;
}

async function writeStatutoryAudit({
  action,
  scheme = null,
  statutoryConfigId = null,
  enrollmentId = null,
  employeeId = null,
  payrollRecordId = null,
  performedById = null,
  oldValues = null,
  newValues = null,
  reason = null,
  req = null,
}) {
  try {
    await prisma.statutoryAuditLog.create({
      data: {
        action,
        scheme,
        statutoryConfigId,
        enrollmentId,
        employeeId,
        payrollRecordId,
        performedById,
        oldValues,
        newValues,
        reason,
        ipAddress: req ? clientIp(req) : null,
        userAgent: req ? req.headers["user-agent"] || null : null,
      },
    });
  } catch (e) {
    console.error("Statutory audit failed:", e.message);
  }
}

app.get("/api/health", (_, res) =>
  res.json({
    ok: true,
    service: "PayrollPro API",
    time: new Date().toISOString(),
  }),
);

/* =========================================================
   ENTERPRISE PERMISSIONS
========================================================= */

const PERMISSIONS = [
  ["EMPLOYEE_VIEW", "View employees"],
  ["EMPLOYEE_CREATE", "Create employees"],
  ["EMPLOYEE_EDIT", "Edit employees"],
  ["SALARY_VIEW", "View salary"],
  ["SALARY_EDIT", "Edit salary"],
  ["ATTENDANCE_VIEW", "View attendance"],
  ["ATTENDANCE_EDIT", "Edit attendance"],
  ["LEAVE_VIEW", "View leave"],
  ["LEAVE_MANAGE", "Manage leave"],
  ["LEAVE_APPROVE", "Approve leave"],
  ["PAYROLL_VIEW", "View payroll"],
  ["PAYROLL_PROCESS", "Process payroll"],
  ["PAYROLL_APPROVE", "Approve payroll"],
  ["PAYSLIP_VIEW", "View payslips"],
  ["PAYSLIP_GENERATE", "Generate payslips"],
  ["REPORT_CREATE", "Create reports"],
  ["REPORT_VIEW_OWN", "View own reports"],
  ["REPORT_VIEW_ASSIGNED", "View assigned reports"],
  ["REPORT_VIEW_ALL", "View all reports"],
  ["REPORT_ASSIGN", "Assign reports"],
  ["REPORT_UPDATE", "Update reports"],
  ["REPORT_COMMENT", "Comment on reports"],
  ["REPORT_RESOLVE", "Resolve reports"],
  ["REPORT_CLOSE", "Close reports"],
  ["REPORT_EXPORT", "Export reports"],
  ["USER_VIEW", "View users"],
  ["USER_CREATE", "Create users"],
  ["USER_EDIT", "Edit users"],
  ["USER_DEACTIVATE", "Activate/deactivate users"],
  ["PERMISSION_VIEW", "View permissions"],
  ["PERMISSION_GRANT", "Grant permissions"],
  ["PERMISSION_REVOKE", "Revoke permissions"],
  ["AUDIT_VIEW", "View audit records"],
  ["COMPANY_SETTINGS_MANAGE", "Manage company profile"],
  ["SECURITY_SETTINGS_MANAGE", "Manage security settings"],
];

async function effectivePermissions(userId, role) {
  const [defaults, overrides] = await Promise.all([
    prisma.rolePermission.findMany({
      where: {
        role,
      },
      include: {
        permission: true,
      },
    }),
    prisma.userPermission.findMany({
      where: {
        userId,
      },
      include: {
        permission: true,
      },
    }),
  ]);

  const set = new Set(defaults.map((x) => x.permission.code));

  for (const x of overrides) {
    if (x.granted) {
      set.add(x.permission.code);
    } else {
      set.delete(x.permission.code);
    }
  }

  return [...set];
}

async function requirePermission(req, res, next) {
  const code = req.permissionCode;
  const perms = await effectivePermissions(req.user.id, req.user.role);

  if (req.user.role === Role.ADMIN || perms.includes(code)) {
    return next();
  }

  return fail(res, 403, "Permission required: " + code);
}

function permission(code) {
  return (req, res, next) => {
    req.permissionCode = code;

    requirePermission(req, res, next).catch(() =>
      fail(res, 500, "Permission check failed"),
    );
  };
}

/* =========================================================
   INITIAL SETUP
========================================================= */

app.get("/api/setup/status", async (_req, res) => {
  try {
    const users = await prisma.user.count();

    res.json({
      initialized: users > 0,
    });
  } catch {
    fail(res, 500, "Could not read setup status");
  }
});

app.post("/api/setup", async (req, res) => {
  try {
    if (await prisma.user.count()) {
      return fail(res, 409, "System is already initialized");
    }

    const {
      email,
      password,
      companyName,
      legalName,
      address,
      phone,
      website,
      pan,
      vat,
      registrationNumber,
    } = req.body;

    if (!email || !password || password.length < 8 || !companyName) {
      return fail(
        res,
        400,
        "Company name, email and a password of at least 8 characters are required",
      );
    }

    const hash = await passwordHash(password);

    const result = await prisma.$transaction(async (tx) => {
      const admin = await tx.user.create({
        data: {
          email: String(email).trim().toLowerCase(),
          passwordHash: hash,
          role: Role.ADMIN,
          isActive: true,
          activatedAt: new Date(),
        },
      });

      await tx.companyProfile.upsert({
        where: {
          id: 1,
        },
        update: {
          companyName,
          legalName,
          address,
          phone,
          website,
          pan,
          vat,
          registrationNumber,
        },
        create: {
          id: 1,
          companyName,
          legalName,
          address,
          phone,
          website,
          pan,
          vat,
          registrationNumber,
        },
      });

      await tx.accountLimit.upsert({
        where: {
          id: 1,
        },
        update: {},
        create: {
          id: 1,
          maxAdmins: 3,
          maxHr: 10,
          maxPayrollManagers: 5,
        },
      });

      return admin;
    });

    await audit(req, "SYSTEM_INITIALIZED", "SYSTEM", result.id, {
      companyName,
    });

    res.status(201).json({
      message: "PayrollPro initialized successfully",
      adminId: result.id,
    });
  } catch (e) {
    console.error(e);

    fail(
      res,
      400,
      e.code === "P2002"
        ? "Email already exists"
        : "Could not initialize PayrollPro",
    );
  }
});

/* =========================================================
   COMPANY
========================================================= */

app.get("/api/company", auth, async (_req, res) => {
  const c = await prisma.companyProfile.findUnique({
    where: {
      id: 1,
    },
  });

  res.json(c || {});
});

app.patch("/api/company", auth, allow(Role.ADMIN), async (req, res) => {
  try {
    const allowed = [
      "companyName",
      "legalName",
      "logoUrl",
      "address",
      "phone",
      "email",
      "website",
      "pan",
      "vat",
      "registrationNumber",
      "currency",
      "timezone",
      "fiscalYear",
      "payslipFooter",
      "payslipSignature",
    ];

    const data = {};

    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        data[k] = req.body[k] === null ? "" : req.body[k];
      }
    }

    const before = await prisma.companyProfile.findUnique({
      where: {
        id: 1,
      },
    });

    const after = await prisma.companyProfile.upsert({
      where: {
        id: 1,
      },
      update: data,
      create: {
        id: 1,
        companyName: data.companyName || "Company",
        ...data,
      },
    });

    await audit(req, "COMPANY_PROFILE_UPDATED", "COMPANY", 1, {
      changes: changedFields(before, after, allowed),
    });

    res.json(after);
  } catch {
    fail(res, 400, "Could not update company profile");
  }
});

app.post(
  "/api/company/logo",
  auth,
  allow(Role.ADMIN),
  upload.single("logo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return fail(res, 400, "Valid image required");
      }

      const url = `/uploads/${req.file.filename}`;

      await prisma.companyProfile.upsert({
        where: {
          id: 1,
        },
        update: {
          logoUrl: url,
        },
        create: {
          id: 1,
          companyName: "Company",
          logoUrl: url,
        },
      });

      await audit(req, "COMPANY_LOGO_UPDATED", "COMPANY", 1, {});

      res.json({
        logoUrl: url,
      });
    } catch {
      fail(res, 400, "Could not upload company logo");
    }
  },
);

/* =========================================================
   ACCOUNT LIMITS / PERMISSIONS
========================================================= */

app.get(
  "/api/admin/account-limits",
  auth,
  allow(Role.ADMIN),
  async (_req, res) => {
    const l = await prisma.accountLimit.upsert({
      where: {
        id: 1,
      },
      update: {},
      create: {
        id: 1,
        maxAdmins: 3,
        maxHr: 10,
        maxPayrollManagers: 5,
      },
    });

    const counts = await Promise.all([
      prisma.user.count({
        where: {
          role: Role.ADMIN,
          isActive: true,
        },
      }),
      prisma.user.count({
        where: {
          role: Role.HR,
          isActive: true,
        },
      }),
      prisma.user.count({
        where: {
          role: Role.PAYROLL_MANAGER,
          isActive: true,
        },
      }),
    ]);

    res.json({
      limits: l,
      active: {
        ADMIN: counts[0],
        HR: counts[1],
        PAYROLL_MANAGER: counts[2],
      },
    });
  },
);

app.patch(
  "/api/admin/account-limits",
  auth,
  allow(Role.ADMIN),
  async (req, res) => {
    try {
      const current = await prisma.accountLimit.upsert({
        where: {
          id: 1,
        },
        update: {},
        create: {
          id: 1,
          maxAdmins: 3,
          maxHr: 10,
          maxPayrollManagers: 5,
        },
      });

      const data = {};

      if (req.body.maxAdmins !== undefined) {
        data.maxAdmins = Math.max(1, Number(req.body.maxAdmins));
      }

      if (req.body.maxHr !== undefined) {
        data.maxHr = Math.max(1, Number(req.body.maxHr));
      }

      if (req.body.maxPayrollManagers !== undefined) {
        data.maxPayrollManagers = Math.max(
          1,
          Number(req.body.maxPayrollManagers),
        );
      }

      const active = await Promise.all([
        prisma.user.count({
          where: {
            role: Role.ADMIN,
            isActive: true,
          },
        }),
        prisma.user.count({
          where: {
            role: Role.HR,
            isActive: true,
          },
        }),
        prisma.user.count({
          where: {
            role: Role.PAYROLL_MANAGER,
            isActive: true,
          },
        }),
      ]);

      if (
        data.maxAdmins < active[0] ||
        data.maxHr < active[1] ||
        data.maxPayrollManagers < active[2]
      ) {
        return fail(
          res,
          400,
          "A limit cannot be lower than the current active account count",
        );
      }

      const x = await prisma.accountLimit.update({
        where: {
          id: current.id,
        },
        data,
      });

      await audit(req, "ACCOUNT_LIMITS_UPDATED", "ACCOUNT_LIMIT", 1, {
        from: current,
        to: x,
      });

      res.json(x);
    } catch {
      fail(res, 400, "Could not update account limits");
    }
  },
);

app.get(
  "/api/permissions",
  auth,
  permission("PERMISSION_VIEW"),
  async (_req, res) =>
    res.json(
      await prisma.permission.findMany({
        orderBy: {
          code: "asc",
        },
      }),
    ),
);

app.get(
  "/api/users/:id/permissions",
  auth,
  permission("PERMISSION_VIEW"),
  async (req, res) => {
    const id = num(req.params.id);

    const target = await prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        role: true,
      },
    });

    if (!target) {
      return fail(res, 404, "User not found");
    }

    res.json({
      userId: id,
      permissions: await effectivePermissions(id, target.role),
    });
  },
);

app.put(
  "/api/users/:id/permissions",
  auth,
  allow(Role.ADMIN),
  async (req, res) => {
    try {
      const id = num(req.params.id);
      const codes = Array.isArray(req.body.permissions)
        ? req.body.permissions
        : [];

      const target = await prisma.user.findUnique({
        where: {
          id,
        },
      });

      if (!target) {
        return fail(res, 404, "User not found");
      }

      const perms = await prisma.permission.findMany({
        where: {
          code: {
            in: codes,
          },
        },
      });

      await prisma.$transaction(async (tx) => {
        await tx.userPermission.deleteMany({
          where: {
            userId: id,
          },
        });

        if (perms.length) {
          await tx.userPermission.createMany({
            data: perms.map((p) => ({
              userId: id,
              permissionId: p.id,
              granted: true,
              grantedById: req.user.id,
            })),
          });
        }
      });

      await audit(req, "PERMISSIONS_UPDATED", "USER", id, {
        permissionCodes: perms.map((p) => p.code),
      });

      await notify(
        id,
        "Permissions updated",
        "Your PayrollPro permissions have been updated by an administrator.",
        "SECURITY",
      );

      res.json({
        userId: id,
        permissions: await effectivePermissions(id, target.role),
      });
    } catch {
      fail(res, 400, "Could not update permissions");
    }
  },
);

/* =========================================================
   AUTH
========================================================= */

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return fail(res, 400, "Email and password are required");
    }

    const user = await prisma.user.findUnique({
      where: {
        email: email.toLowerCase(),
      },
      include: {
        employee: {
          include: {
            department: true,
            designation: true,
            branch: true,
          },
        },
      },
    });

    if (
      !user ||
      !user.isActive ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      return fail(res, 401, "Invalid credentials");
    }

    const rawSession = randomToken();

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawSession),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        ipAddress: clientIp(req),
        userAgent: req.headers["user-agent"] || null,
      },
    });

    const token = await sign(user, session.id);

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        lastLoginAt: new Date(),
        activatedAt: user.activatedAt || new Date(),
      },
    });

    await audit(req, "LOGIN", "USER", user.id, {
      email: user.email,
    });

    await security(req, user.id, "LOGIN", {
      email: user.email,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employee: user.employee,
        permissions: await effectivePermissions(user.id, user.role),
      },
    });
  } catch (e) {
    console.error(e);
    fail(res, 500, "Login failed");
  }
});

app.post("/api/auth/logout", auth, async (req, res) => {
  try {
    if (req.user.sid) {
      await prisma.session.updateMany({
        where: {
          id: Number(req.user.sid),
          userId: req.user.id,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    await audit(req, "LOGOUT", "USER", req.user.id, {});

    await security(req, req.user.id, "LOGOUT");

    res.json({
      message: "Signed out",
    });
  } catch {
    res.json({
      message: "Signed out",
    });
  }
});

app.get("/api/auth/me", auth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: {
      id: req.user.id,
    },
    select: safeUser,
  });

  if (!user) {
    return fail(res, 404, "User not found");
  }

  res.json(user);
});

app.post("/api/auth/change-password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return fail(res, 400, "New password must be at least 8 characters");
    }

    const since =
      req.user.role === Role.EMPLOYEE
        ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const changes = await prisma.auditLog.count({
      where: {
        userId: req.user.id,
        action: "PASSWORD_CHANGED",
        createdAt: {
          gte: since,
        },
      },
    });

    const limit = req.user.role === Role.EMPLOYEE ? 1 : 3;

    if (changes >= limit) {
      return fail(
        res,
        429,
        `Password change limit reached (${limit}). Use Forgot Password or request the required approval.`,
      );
    }

    const u = await prisma.user.findUnique({
      where: {
        id: req.user.id,
      },
    });

    if (!(await bcrypt.compare(currentPassword, u.passwordHash))) {
      return fail(res, 400, "Current password is incorrect");
    }

    await prisma.user.update({
      where: {
        id: u.id,
      },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 12),
        mustChangePassword: false,
      },
    });

    await audit(req, "PASSWORD_CHANGED", "USER", u.id, {});

    await security(req, u.id, "PASSWORD_CHANGED");

    await notify(
      u.id,
      "Password changed",
      "Your PayrollPro password was changed successfully.",
      "SECURITY",
    );

    res.json({
      message: "Password changed",
    });
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not change password");
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return fail(res, 400, "Email is required");
    }

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    const response = {
      message: "If the account exists, a password reset has been initiated.",
    };

    if (!user) {
      return res.json(response);
    }

    await prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
    });

    const raw = crypto.randomBytes(32).toString("hex");

    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        type: PasswordTokenType.PASSWORD_RESET,
      },
    });

    await security(req, user.id, "PASSWORD_RESET_REQUESTED");

    await audit(req, "PASSWORD_RESET_REQUESTED", "USER", user.id, {});

    await notify(
      user.id,
      "Password reset requested",
      "A password reset was requested for your account.",
      "SECURITY",
    );

    const resetUrl = `${
      process.env.CLIENT_URL || "http://localhost:5173"
    }/?reset=${raw}`;

    await sendSecurityEmail({
      to: user.email,
      subject: "PayrollPro password reset",
      html: `
          <p>A password reset was requested for your PayrollPro account.</p>
          <p><a href="${resetUrl}">Reset your password</a></p>
          <p>This link expires in 15 minutes and can only be used once.</p>
        `,
    }).catch(() => {});

    if (process.env.NODE_ENV !== "production") {
      response.devResetToken = raw;
    }

    res.json(response);
  } catch (e) {
    console.error(e);
    fail(res, 500, "Unable to process password reset request");
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const raw = String(req.body.token || "");

    const newPassword = String(req.body.newPassword || "");

    if (raw.length < 32 || newPassword.length < 8) {
      return fail(res, 400, "A valid reset token and password are required");
    }

    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");

    const result = await prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({
        where: {
          tokenHash,
        },
      });

      if (!token || token.usedAt || token.expiresAt <= new Date()) {
        throw new Error("Reset token is invalid or expired");
      }

      const hash = await bcrypt.hash(newPassword, 12);

      await tx.user.update({
        where: {
          id: token.userId,
        },
        data: {
          passwordHash: hash,
          mustChangePassword: false,
          ...(token.type === PasswordTokenType.ACTIVATION
            ? {
                isActive: true,
                activatedAt: new Date(),
                employee: {
                  update: {
                    status: "ACTIVE",
                  },
                },
              }
            : {}),
        },
      });

      await tx.passwordResetToken.update({
        where: {
          id: token.id,
        },
        data: {
          usedAt: new Date(),
        },
      });

      await tx.session.updateMany({
        where: {
          userId: token.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      return token.userId;
    });

    await security(req, result, "PASSWORD_RESET_COMPLETED");

    await audit(req, "PASSWORD_RESET_COMPLETED", "USER", result, {});

    await notify(
      result,
      "Password reset completed",
      "Your PayrollPro password was reset successfully.",
      "SECURITY",
    );

    res.json({
      message: "Password reset successfully",
    });
  } catch (e) {
    fail(
      res,
      400,
      e.message === "Reset token is invalid or expired"
        ? e.message
        : "Unable to reset password",
    );
  }
});

/* =========================================================
   DASHBOARD
========================================================= */

app.get("/api/dashboard", auth, async (req, res) => {
  try {
    const y = new Date().getFullYear();
    const m = new Date().getMonth() + 1;

    const [employees, active, leavePending, period, perf] = await Promise.all([
      prisma.employee.count(),

      prisma.employee.count({
        where: {
          status: "ACTIVE",
        },
      }),

      prisma.leaveRequest.count({
        where: {
          status: "PENDING",
        },
      }),

      prisma.payrollPeriod.findUnique({
        where: {
          year_month: {
            year: y,
            month: m,
          },
        },
        include: {
          _count: {
            select: {
              records: true,
            },
          },
        },
      }),

      prisma.performanceReview.aggregate({
        _avg: {
          finalScore: true,
        },
        where: {
          finalScore: {
            not: null,
          },
        },
      }),
    ]);

    if (req.user.role === Role.EMPLOYEE) {
      const emp = await prisma.user.findUnique({
        where: {
          id: req.user.id,
        },
        select: {
          employeeId: true,
        },
      });

      const eid = emp?.employeeId;

      if (!eid) {
        return res.json({});
      }

      const [used, goals, last] = await Promise.all([
        prisma.leaveBalance.aggregate({
          _sum: {
            used: true,
          },
          where: {
            employeeId: eid,
            year: y,
          },
        }),

        prisma.performanceGoal.count({
          where: {
            employeeId: eid,
          },
        }),

        prisma.payrollRecord.findFirst({
          where: {
            employeeId: eid,
          },
          orderBy: [
            {
              period: {
                year: "desc",
              },
            },
            {
              period: {
                month: "desc",
              },
            },
          ],
          include: {
            period: true,
          },
        }),
      ]);

      return res.json({
        employee: {
          leaveUsed: num(used._sum.used),
          goals,
          lastPayroll: last,
        },
      });
    }

    return res.json({
      employees,
      active,
      leavePending,
      period,
      performance: num(perf._avg.finalScore),
    });
  } catch (e) {
    console.error(e);
    fail(res, 500, "Dashboard failed");
  }
});

/* =========================================================
   DEPARTMENTS
========================================================= */

app.get("/api/departments", auth, async (_req, res) => {
  try {
    res.json(
      await prisma.department.findMany({
        orderBy: {
          name: "asc",
        },
      }),
    );
  } catch {
    fail(res, 500, "Could not load departments");
  }
});

app.post(
  "/api/departments",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const name = String(req.body.name || "").trim();

      const code = String(req.body.code || "")
        .trim()
        .toUpperCase();

      if (!name || !code) {
        return fail(res, 400, "Department name and code are required");
      }

      const department = await prisma.department.create({
        data: {
          name,
          code,
          nextEmployeeNo: 1,
        },
      });

      await audit(req, "CREATE", "DEPARTMENT", department.id, {
        name,
        code,
      });

      res.status(201).json(department);
    } catch (e) {
      fail(
        res,
        400,
        e.code === "P2002"
          ? "Department name or code already exists"
          : "Could not create department",
      );
    }
  },
);

app.patch(
  "/api/departments/:id",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const data = {};

      if (req.body.name !== undefined) {
        data.name = String(req.body.name).trim();
      }

      if (req.body.code !== undefined) {
        data.code = String(req.body.code).trim().toUpperCase();
      }

      if (!Object.keys(data).length) {
        return fail(res, 400, "No changes supplied");
      }

      const department = await prisma.department.update({
        where: {
          id: num(req.params.id),
        },
        data,
      });

      await audit(req, "UPDATE", "DEPARTMENT", department.id, {
        fields: Object.keys(data),
      });

      res.json(department);
    } catch (e) {
      fail(
        res,
        400,
        e.code === "P2002"
          ? "Department name or code already exists"
          : "Could not update department",
      );
    }
  },
);

/* =========================================================
   BRANCHES
========================================================= */

app.get("/api/branches", auth, async (_req, res) => {
  try {
    res.json(
      await prisma.branch.findMany({
        orderBy: {
          name: "asc",
        },
      }),
    );
  } catch {
    fail(res, 500, "Could not load branches");
  }
});

app.post(
  "/api/branches",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const name = String(req.body.name || "").trim();

      if (!name) {
        return fail(res, 400, "Branch name is required");
      }

      const x = await prisma.branch.create({
        data: {
          name,
        },
      });

      await audit(req, "CREATE", "BRANCH", x.id, {
        name,
      });

      res.status(201).json(x);
    } catch (e) {
      fail(
        res,
        400,
        e.code === "P2002"
          ? "Branch already exists"
          : "Could not create branch",
      );
    }
  },
);

app.patch(
  "/api/branches/:id",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const name = String(req.body.name || "").trim();

      if (!name) {
        return fail(res, 400, "Branch name is required");
      }

      const x = await prisma.branch.update({
        where: {
          id: num(req.params.id),
        },
        data: {
          name,
        },
      });

      await audit(req, "UPDATE", "BRANCH", x.id, {
        name,
      });

      res.json(x);
    } catch (e) {
      fail(
        res,
        400,
        e.code === "P2002"
          ? "Branch already exists"
          : "Could not update branch",
      );
    }
  },
);

/* =========================================================
   DESIGNATIONS
========================================================= */

app.get("/api/designations", auth, async (_req, res) => {
  try {
    res.json(
      await prisma.designation.findMany({
        orderBy: {
          title: "asc",
        },
      }),
    );
  } catch {
    fail(res, 500, "Could not load designations");
  }
});

app.post(
  "/api/designations",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const title = String(req.body.title || "").trim();

      if (!title) {
        return fail(res, 400, "Designation title is required");
      }

      const x = await prisma.designation.create({
        data: {
          title,
        },
      });

      await audit(req, "CREATE", "DESIGNATION", x.id, {
        title,
      });

      res.status(201).json(x);
    } catch (e) {
      fail(
        res,
        400,
        e.code === "P2002"
          ? "Designation already exists"
          : "Could not create designation",
      );
    }
  },
);

app.patch(
  "/api/designations/:id",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const title = String(req.body.title || "").trim();

      if (!title) {
        return fail(res, 400, "Designation title is required");
      }

      const x = await prisma.designation.update({
        where: {
          id: num(req.params.id),
        },
        data: {
          title,
        },
      });

      await audit(req, "UPDATE", "DESIGNATION", x.id, {
        title,
      });

      res.json(x);
    } catch (e) {
      fail(
        res,
        400,
        e.code === "P2002"
          ? "Designation already exists"
          : "Could not update designation",
      );
    }
  },
);

/* =========================================================
   EMPLOYEES
========================================================= */

function initialsFromName(firstName, lastName) {
  const a = String(firstName || "")
    .trim()
    .charAt(0)
    .toUpperCase();

  const b = String(lastName || "")
    .trim()
    .charAt(0)
    .toUpperCase();

  return `${a}${b}`;
}

async function generateEmployeeCode(tx, departmentId, firstName, lastName) {
  const department = await tx.department.findUnique({
    where: {
      id: departmentId,
    },
  });

  if (!department) {
    throw new Error("Department not found");
  }

  const number = department.nextEmployeeNo;

  const initials = initialsFromName(firstName, lastName);

  const base = `${department.code}-${String(number).padStart(
    4,
    "0",
  )}-${initials}`;

  let candidate = base;
  let suffix = 2;

  while (
    await tx.employee.findUnique({
      where: {
        employeeCode: candidate,
      },
      select: {
        id: true,
      },
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix++;
  }

  await tx.department.update({
    where: {
      id: department.id,
    },
    data: {
      nextEmployeeNo: {
        increment: 1,
      },
    },
  });

  return candidate;
}

app.get("/api/employees", auth, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    const departmentId = req.query.departmentId
      ? num(req.query.departmentId)
      : undefined;

    const status = req.query.status ? String(req.query.status) : undefined;

    const where = {};

    if (q) {
      where.OR = [
        {
          employeeCode: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          firstName: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          lastName: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          email: {
            contains: q,
            mode: "insensitive",
          },
        },
      ];
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    if (status) {
      where.status = status;
    }

    if (req.user.role === Role.EMPLOYEE) {
      where.id = req.user.employeeId;
    }

    res.json(
      await prisma.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: [
          {
            firstName: "asc",
          },
          {
            lastName: "asc",
          },
        ],
        take: 1000,
      }),
    );
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not load employees");
  }
});

app.get("/api/employees/:id", auth, async (req, res) => {
  try {
    const id = num(req.params.id);

    if (req.user.role === Role.EMPLOYEE && !isEmployee(req, id)) {
      return fail(res, 403, "Own employee record only");
    }

    const employee = await prisma.employee.findUnique({
      where: {
        id,
      },
      include: employeeInclude,
    });

    if (!employee) {
      return fail(res, 404, "Employee not found");
    }

    res.json(employee);
  } catch {
    fail(res, 500, "Could not load employee");
  }
});

app.post(
  "/api/employees",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const {
        firstName,
        lastName,
        email,
        phone,
        departmentId,
        designationId,
        branchId,
        address,
        gender,
        dateOfBirth,
        joinDate,
      } = req.body;

      if (!firstName || !lastName || !email || !departmentId) {
        return fail(
          res,
          400,
          "First name, last name, email and department are required",
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        const normalizedEmail = String(email).trim().toLowerCase();

        const existing = await tx.employee.findUnique({
          where: {
            email: normalizedEmail,
          },
        });

        if (existing) {
          throw new Error("Employee email already exists");
        }

        const employeeCode = await generateEmployeeCode(
          tx,
          num(departmentId),
          firstName,
          lastName,
        );

        const employee = await tx.employee.create({
          data: {
            employeeCode,
            firstName: String(firstName).trim(),
            lastName: String(lastName).trim(),
            email: normalizedEmail,
            phone: phone || null,
            departmentId: num(departmentId),
            designationId: designationId ? num(designationId) : null,
            branchId: branchId ? num(branchId) : null,
            address: address || null,
            gender: gender || null,
            dateOfBirth: dateOfBirth ? dateOnly(dateOfBirth) : null,
            joinDate: joinDate ? dateOnly(joinDate) : new Date(),
            status: "ACTIVE",
          },
          include: employeeInclude,
        });

        return employee;
      });

      await audit(req, "CREATE", "EMPLOYEE", result.id, {
        employeeCode: result.employeeCode,
        departmentId: result.departmentId,
      });

      res.status(201).json(result);
    } catch (e) {
      console.error(e);

      fail(res, 400, e.message || "Could not create employee");
    }
  },
);

app.patch(
  "/api/employees/:id",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id);

      const before = await prisma.employee.findUnique({
        where: {
          id,
        },
      });

      if (!before) {
        return fail(res, 404, "Employee not found");
      }

      const allowed = [
        "firstName",
        "lastName",
        "email",
        "phone",
        "departmentId",
        "designationId",
        "branchId",
        "address",
        "gender",
        "dateOfBirth",
        "joinDate",
        "status",
      ];

      const data = {};

      for (const key of allowed) {
        if (req.body[key] === undefined) {
          continue;
        }

        if (["departmentId", "designationId", "branchId"].includes(key)) {
          data[key] =
            req.body[key] === null || req.body[key] === ""
              ? null
              : num(req.body[key]);
        } else if (["dateOfBirth", "joinDate"].includes(key)) {
          data[key] =
            req.body[key] === null || req.body[key] === ""
              ? null
              : dateOnly(req.body[key]);
        } else {
          data[key] = req.body[key];
        }
      }

      const employee = await prisma.employee.update({
        where: {
          id,
        },
        data,
        include: employeeInclude,
      });

      await audit(req, "UPDATE", "EMPLOYEE", id, {
        changes: changedFields(before, employee, allowed),
      });

      res.json(employee);
    } catch (e) {
      fail(
        res,
        400,
        e.code === "P2002"
          ? "Employee email already exists"
          : "Could not update employee",
      );
    }
  },
);

app.patch(
  "/api/employees/:id/status",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id);
      const status = String(req.body.status || "").toUpperCase();

      if (!status) {
        return fail(res, 400, "Status is required");
      }

      const employee = await prisma.employee.update({
        where: {
          id,
        },
        data: {
          status,
        },
        include: employeeInclude,
      });

      await audit(req, "STATUS_CHANGED", "EMPLOYEE", id, {
        status,
      });

      res.json(employee);
    } catch {
      fail(res, 400, "Could not update employee status");
    }
  },
);

/* =========================================================
   ATTENDANCE
========================================================= */
// app.get(
//   "/api/attendance",
//   auth,
//   async (req, res) => {
//     try {
//       const where = {};

//       if (req.query.employeeId) {
//         where.employeeId =
//           num(req.query.employeeId);
//       }

//       if (req.query.from || req.query.to) {
//         where.workDate = {};

//         if (req.query.from) {
//           where.workDate.gte =
//             dateOnly(req.query.from);
//         }

//         if (req.query.to) {
//           const end = dateOnly(
//             req.query.to,
//           );
//           end.setDate(end.getDate() + 1);
//           where.workDate.lt = end;
//         }
//       }

//       if (req.user.role === Role.EMPLOYEE) {
//         where.employeeId =
//           req.user.employeeId;
//       }

//       res.json(
//         await prisma.attendance.findMany({
//           where,
//           include: attendanceInclude,
//           orderBy: [
//             {
//               workDate: "desc",
//             },
//             {
//               employeeId: "asc",
//             },
//           ],
//           take: 1000,
//         }),
//       );
//     } catch (e) {
//       console.error(e);
//       fail(
//         res,
//         500,
//         "Could not load attendance",
//       );
//     }
//   },
// );
// app.get(
//   "/api/attendance/me",
//   auth,
//   async (req, res) => {
//     try {
//       if (!req.user.employeeId) {
//         return res.json([]);
//       }

//       res.json(
//         await prisma.attendance.findMany({
//           where: {
//             employeeId:
//               req.user.employeeId,
//           },
//           include: attendanceInclude,
//           orderBy: {
//             workDate: "desc",
//           },
//           take: 500,
//         }),
//       );
//     } catch (e) {
//       console.error(e);
//       fail(
//         res,
//         500,
//         "Could not load your attendance",
//       );
//     }
//   },
// );
// app.get(
//   "/api/attendance/pending",
//   auth,
//   allow(Role.ADMIN, Role.HR),
//   async (_req, res) => {
//     try {
//       const rows =
//         await prisma.attendance.findMany({
//           where: {
//             OR: [
//               {
//                 checkIn: {
//                   not: null,
//                 },
//                 checkInStatus:
//                   AttendanceApprovalStatus.PENDING,
//               },
//               {
//                 checkOut: {
//                   not: null,
//                 },
//                 checkOutStatus:
//                   AttendanceApprovalStatus.PENDING,
//               },
//             ],
//           },
//           include: attendanceInclude,
//           orderBy: {
//             workDate: "desc",
//           },
//           take: 500,
//         });

//       res.json(rows);
//     } catch {
//       fail(
//         res,
//         500,
//         "Could not load pending attendance",
//       );
//     }
//   },
// );
// app.post(
//   "/api/attendance/check-in",
//   auth,
//   allow(Role.EMPLOYEE, Role.HR, Role.PAYROLL_MANAGER, Role.ADMIN),
//   async (req, res) => {
//     try {
//       if (!req.user.employeeId) {
//         return fail(res, 400, "Employee account is not linked");
//       }

//       const workDate = dateOnly(new Date());

//       const existing = await prisma.attendance.findUnique({
//         where: {
//           employeeId_workDate: {
//             employeeId: req.user.employeeId,
//             workDate,
//           },
//         },
//         include: {
//           requests: {
//             where: { type: "CHECK_IN" },
//             orderBy: { createdAt: "desc" },
//             take: 1,
//           },
//         },
//       });

//       if (existing?.checkInStatus === AttendanceApprovalStatus.APPROVED) {
//         return fail(res, 400, "Your check-in is already approved");
//       }

//       if (existing?.requests?.[0]?.status === AttendanceApprovalStatus.PENDING) {
//         return fail(res, 400, "A check-in request is already pending");
//       }

//       const checkIn = new Date();
//       let attendance;

//       if (existing) {
//         attendance = await prisma.attendance.update({
//           where: { id: existing.id },
//           data: {
//             checkIn,
//             checkInRecordedById: req.user.id,
//             checkInStatus: AttendanceApprovalStatus.PENDING,
//             checkInApprovedById: null,
//             checkInApprovedAt: null,
//             workedDurationMinutes: null,
//             status: AttendanceStatus.PRESENT,
//           },
//         });
//       } else {
//         attendance = await prisma.attendance.create({
//           data: {
//             employeeId: req.user.employeeId,
//             workDate,
//             checkIn,
//             checkInRecordedById: req.user.id,
//             checkInStatus: AttendanceApprovalStatus.PENDING,
//             status: AttendanceStatus.PRESENT,
//           },
//         });
//       }

//       if (!attendance?.id) {
//         return fail(res, 400, "Could not create attendance row");
//       }

//       const request = await prisma.attendanceRequest.create({
//         data: {
//           attendanceId: attendance.id,
//           type: "CHECK_IN",
//           eventTime: checkIn,
//           status: AttendanceApprovalStatus.PENDING,
//           recordedById: req.user.id,
//         },
//       });

//       await audit(req, "CHECK_IN", "ATTENDANCE", attendance.id, {
//         employeeId: attendance.employeeId,
//         requestId: request.id,
//         workDate: attendance.workDate,
//       });

//       const result = await prisma.attendance.findUnique({
//         where: { id: attendance.id },
//         include: attendanceInclude,
//       });

//       return res.json(result);
//     } catch (e) {
//       console.error(e);
//       fail(res, 400, "Could not check in");
//     }
//   },
// );
// app.post(
//   "/api/attendance/check-out",
//   auth,
//   allow(Role.EMPLOYEE, Role.HR, Role.PAYROLL_MANAGER, Role.ADMIN),
//   async (req, res) => {
//     try {
//       if (!req.user.employeeId) {
//         return fail(res, 400, "Employee account is not linked");
//       }

//       const workDate = dateOnly(new Date());

//       const row = await prisma.attendance.findUnique({
//         where: {
//           employeeId_workDate: {
//             employeeId: req.user.employeeId,
//             workDate,
//           },
//         },
//         include: {
//           requests: {
//             where: { type: "CHECK_OUT" },
//             orderBy: { createdAt: "desc" },
//             take: 1,
//           },
//         },
//       });

//       if (!row?.checkIn) {
//         return fail(res, 400, "You must check in first");
//       }

//       if (row.checkInStatus !== AttendanceApprovalStatus.APPROVED) {
//         return fail(
//           res,
//           400,
//           "Your check-in must be approved before you can check out",
//         );
//       }

//       if (row.checkOutStatus === AttendanceApprovalStatus.APPROVED) {
//         return fail(res, 400, "Your check-out is already approved");
//       }

//       if (row.requests?.[0]?.status === AttendanceApprovalStatus.PENDING) {
//         return fail(res, 400, "A check-out request is already pending");
//       }

//       const checkOut = new Date();

//       const attendance = await prisma.attendance.update({
//         where: { id: row.id },
//         data: {
//           checkOut,
//           checkOutRecordedById: req.user.id,
//           checkOutStatus: AttendanceApprovalStatus.PENDING,
//           checkOutApprovedById: null,
//           checkOutApprovedAt: null,
//           workedDurationMinutes: null,
//         },
//       });

//       const request = await prisma.attendanceRequest.create({
//         data: {
//           attendanceId: attendance.id,
//           type: "CHECK_OUT",
//           eventTime: checkOut,
//           status: AttendanceApprovalStatus.PENDING,
//           recordedById: req.user.id,
//         },
//       });

//       await audit(req, "CHECK_OUT", "ATTENDANCE", attendance.id, {
//         employeeId: attendance.employeeId,
//         requestId: request.id,
//         workDate: attendance.workDate,
//       });

//       const result = await prisma.attendance.findUnique({
//         where: { id: attendance.id },
//         include: attendanceInclude,
//       });

//       return res.json(result);
//     } catch (e) {
//       console.error(e);
//       fail(res, 400, "Could not check out");
//     }
//   },
// );
// app.post(
//   "/api/attendance",
//   auth,
//   allow(Role.ADMIN, Role.HR),
//   async (req, res) => {
//     try {
//       const employeeId = num(
//         req.body.employeeId,
//       );

//       if (!employeeId || !req.body.workDate) {
//         return fail(
//           res,
//           400,
//           "Employee and work date are required",
//         );
//       }

//       const workDate = dateOnly(
//         req.body.workDate,
//       );

//       const data = {
//         employeeId,
//         workDate,
//         checkIn: req.body.checkIn
//           ? new Date(req.body.checkIn)
//           : null,
//         checkInRecordedById:
//           req.body.checkIn
//             ? req.user.id
//             : null,
//         checkInStatus:
//           req.body.checkIn
//             ? AttendanceApprovalStatus.APPROVED
//             : AttendanceApprovalStatus.PENDING,
//         checkInApprovedById:
//           req.body.checkIn
//             ? req.user.id
//             : null,
//         checkInApprovedAt:
//           req.body.checkIn
//             ? new Date()
//             : null,
//         checkOut: req.body.checkOut
//           ? new Date(req.body.checkOut)
//           : null,
//         checkOutRecordedById:
//           req.body.checkOut
//             ? req.user.id
//             : null,
//         checkOutStatus:
//           req.body.checkOut
//             ? AttendanceApprovalStatus.APPROVED
//             : AttendanceApprovalStatus.PENDING,
//         checkOutApprovedById:
//           req.body.checkOut
//             ? req.user.id
//             : null,
//         checkOutApprovedAt:
//           req.body.checkOut
//             ? new Date()
//             : null,
//         status:
//           req.body.status ||
//           AttendanceStatus.PRESENT,
//         remarks:
//           req.body.remarks || null,
//       };

//       const attendance =
//         await prisma.attendance.upsert({
//           where: {
//             employeeId_workDate: {
//               employeeId,
//               workDate,
//             },
//           },
//           update: data,
//           create: data,
//           include: attendanceInclude,
//         });

//       await audit(
//         req,
//         "ATTENDANCE_MANUAL",
//         "ATTENDANCE",
//         attendance.id,
//         {
//           employeeId,
//           workDate,
//         },
//       );

//       res.status(201).json(
//         attendance,
//       );
//     } catch (e) {
//       console.error(e);
//       fail(
//         res,
//         400,
//         "Could not save attendance",
//       );
//     }
//   },
// );
app.post(
  "/api/attendance/:id/approve-check-in",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id);

      const x = await prisma.attendance.update({
        where: {
          id,
        },
        data: {
          checkInStatus: AttendanceApprovalStatus.APPROVED,
          checkInApprovedById: req.user.id,
          checkInApprovedAt: new Date(),
        },
        include: attendanceInclude,
      });

      await audit(req, "ATTENDANCE_CHECK_IN_APPROVED", "ATTENDANCE", id, {});

      res.json(x);
    } catch {
      fail(res, 400, "Could not approve check-in");
    }
  },
);
app.post(
  "/api/attendance/:id/approve-check-out",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id);

      const x = await prisma.attendance.update({
        where: {
          id,
        },
        data: {
          checkOutStatus: AttendanceApprovalStatus.APPROVED,
          checkOutApprovedById: req.user.id,
          checkOutApprovedAt: new Date(),
        },
        include: attendanceInclude,
      });

      await audit(req, "ATTENDANCE_CHECK_OUT_APPROVED", "ATTENDANCE", id, {});

      res.json(x);
    } catch {
      fail(res, 400, "Could not approve check-out");
    }
  },
);
/* 1) GET /api/attendance */
app.get("/api/attendance", auth, async (req, res) => {
  try {
    const where = {};

    if (req.query.employeeId) {
      where.employeeId = num(req.query.employeeId);
    }

    if (req.query.from || req.query.to) {
      where.workDate = {};
      if (req.query.from) where.workDate.gte = dateOnly(req.query.from);
      if (req.query.to) {
        const end = dateOnly(req.query.to);
        end.setDate(end.getDate() + 1);
        where.workDate.lt = end;
      }
    } else if (req.query.date) {
      const d = dateOnly(req.query.date);
      const next = dateOnly(req.query.date);
      next.setDate(next.getDate() + 1);
      where.workDate = { gte: d, lt: next };
    }

    if (
      req.user.role === Role.EMPLOYEE ||
      req.user.role === Role.PAYROLL_MANAGER
    ) {
      if (!req.user.employeeId) return res.json([]);
      where.employeeId = req.user.employeeId;
    }

    res.json(
      await prisma.attendance.findMany({
        where,
        include: attendanceInclude,
        orderBy: [{ workDate: "desc" }, { employeeId: "asc" }],
        take: 1000,
      }),
    );
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not load attendance");
  }
});

/* 2) GET /api/attendance/me */
app.get("/api/attendance/me", auth, async (req, res) => {
  try {
    if (!req.user.employeeId) return res.json([]);
    res.json(
      await prisma.attendance.findMany({
        where: { employeeId: req.user.employeeId },
        include: attendanceInclude,
        orderBy: { workDate: "desc" },
        take: 500,
      }),
    );
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not load your attendance");
  }
});

/* 3) GET /api/attendance/pending  — returns AttendanceRequest[] */
app.get(
  "/api/attendance/pending",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const where = { status: AttendanceApprovalStatus.PENDING };
      if (req.query.type) {
        const type = String(req.query.type).toUpperCase();
        if (type !== "CHECK_IN" && type !== "CHECK_OUT") {
          return fail(res, 400, "Invalid attendance request type");
        }
        where.type = type;
      }

      const requests = await prisma.attendanceRequest.findMany({
        where,
        include: {
          attendance: { include: { employee: true } },
          recordedBy: { select: { id: true, email: true, role: true } },
          reviewedBy: { select: { id: true, email: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 500,
      });

      res.json(requests);
    } catch (e) {
      console.error(e);
      fail(res, 500, "Could not load pending attendance approvals");
    }
  },
);

/* 4) POST /api/attendance/check-in */
app.post(
  "/api/attendance/check-in",
  auth,
  allow(Role.EMPLOYEE, Role.HR, Role.PAYROLL_MANAGER, Role.ADMIN),
  async (req, res) => {
    try {
      if (!req.user.employeeId) {
        return fail(res, 400, "Employee account is not linked");
      }

      const workDate = dateOnly(new Date());

      const existing = await prisma.attendance.findUnique({
        where: {
          employeeId_workDate: {
            employeeId: req.user.employeeId,
            workDate,
          },
        },
        include: {
          requests: {
            where: { type: "CHECK_IN" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      if (existing?.checkInStatus === AttendanceApprovalStatus.APPROVED) {
        return fail(res, 400, "Your check-in is already approved");
      }

      if (
        existing?.requests?.[0]?.status === AttendanceApprovalStatus.PENDING
      ) {
        return fail(res, 400, "A check-in request is already pending");
      }

      const checkIn = new Date();
      let attendance;

      if (existing) {
        attendance = await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            checkIn,
            checkInRecordedById: req.user.id,
            checkInStatus: AttendanceApprovalStatus.PENDING,
            checkInApprovedById: null,
            checkInApprovedAt: null,
            workedDurationMinutes: null,
            status: AttendanceStatus.PRESENT,
          },
        });
      } else {
        attendance = await prisma.attendance.create({
          data: {
            employeeId: req.user.employeeId,
            workDate,
            checkIn,
            checkInRecordedById: req.user.id,
            checkInStatus: AttendanceApprovalStatus.PENDING,
            status: AttendanceStatus.PRESENT,
          },
        });
      }

      if (!attendance?.id) {
        return fail(res, 400, "Could not create attendance row");
      }

      const request = await prisma.attendanceRequest.create({
        data: {
          attendanceId: attendance.id,
          type: "CHECK_IN",
          eventTime: checkIn,
          status: AttendanceApprovalStatus.PENDING,
          recordedById: req.user.id,
        },
      });

      await audit(req, "CHECK_IN", "ATTENDANCE", attendance.id, {
        employeeId: attendance.employeeId,
        requestId: request.id,
        workDate: attendance.workDate,
      });

      const result = await prisma.attendance.findUnique({
        where: { id: attendance.id },
        include: attendanceInclude,
      });

      return res.json(result);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not check in");
    }
  },
);

/* 5) POST /api/attendance/check-out */
app.post(
  "/api/attendance/check-out",
  auth,
  allow(Role.EMPLOYEE, Role.HR, Role.PAYROLL_MANAGER, Role.ADMIN),
  async (req, res) => {
    try {
      if (!req.user.employeeId) {
        return fail(res, 400, "Employee account is not linked");
      }

      const workDate = dateOnly(new Date());

      const row = await prisma.attendance.findUnique({
        where: {
          employeeId_workDate: {
            employeeId: req.user.employeeId,
            workDate,
          },
        },
        include: {
          requests: {
            where: { type: "CHECK_OUT" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      if (!row?.checkIn) {
        return fail(res, 400, "You must check in first");
      }

      if (row.checkInStatus !== AttendanceApprovalStatus.APPROVED) {
        return fail(
          res,
          400,
          "Your check-in must be approved before you can check out",
        );
      }

      if (row.checkOutStatus === AttendanceApprovalStatus.APPROVED) {
        return fail(res, 400, "Your check-out is already approved");
      }

      if (row.requests?.[0]?.status === AttendanceApprovalStatus.PENDING) {
        return fail(res, 400, "A check-out request is already pending");
      }

      const checkOut = new Date();

      const attendance = await prisma.attendance.update({
        where: { id: row.id },
        data: {
          checkOut,
          checkOutRecordedById: req.user.id,
          checkOutStatus: AttendanceApprovalStatus.PENDING,
          checkOutApprovedById: null,
          checkOutApprovedAt: null,
          workedDurationMinutes: null,
        },
      });

      const request = await prisma.attendanceRequest.create({
        data: {
          attendanceId: attendance.id,
          type: "CHECK_OUT",
          eventTime: checkOut,
          status: AttendanceApprovalStatus.PENDING,
          recordedById: req.user.id,
        },
      });

      await audit(req, "CHECK_OUT", "ATTENDANCE", attendance.id, {
        employeeId: attendance.employeeId,
        requestId: request.id,
        workDate: attendance.workDate,
      });

      const result = await prisma.attendance.findUnique({
        where: { id: attendance.id },
        include: attendanceInclude,
      });

      return res.json(result);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not check out");
    }
  },
);

/* 6) POST /api/attendance — manual HR/Admin entry */
app.post(
  "/api/attendance",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const employeeId = num(req.body.employeeId);
      if (!employeeId || !req.body.workDate) {
        return fail(res, 400, "Employee and work date are required");
      }

      const workDate = dateOnly(req.body.workDate);
      const hasIn = Boolean(req.body.checkIn);
      const hasOut = Boolean(req.body.checkOut);

      const data = {
        employeeId,
        workDate,
        checkIn: hasIn ? new Date(req.body.checkIn) : null,
        checkInRecordedById: hasIn ? req.user.id : null,
        checkInStatus: hasIn ? AttendanceApprovalStatus.APPROVED : null,
        checkInApprovedById: hasIn ? req.user.id : null,
        checkInApprovedAt: hasIn ? new Date() : null,
        checkOut: hasOut ? new Date(req.body.checkOut) : null,
        checkOutRecordedById: hasOut ? req.user.id : null,
        checkOutStatus: hasOut ? AttendanceApprovalStatus.APPROVED : null,
        checkOutApprovedById: hasOut ? req.user.id : null,
        checkOutApprovedAt: hasOut ? new Date() : null,
        status: req.body.status || AttendanceStatus.PRESENT,
        remarks: req.body.remarks || null,
      };

      const attendance = await prisma.attendance.upsert({
        where: { employeeId_workDate: { employeeId, workDate } },
        update: data,
        create: data,
        include: attendanceInclude,
      });

      await audit(req, "ATTENDANCE_MANUAL", "ATTENDANCE", attendance.id, {
        employeeId,
        workDate,
      });

      res.status(201).json(attendance);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not save attendance");
    }
  },
);

/* 7) POST /api/attendance/requests/:requestId/approve */
app.post(
  "/api/attendance/requests/:requestId/approve",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const requestId = num(req.params.requestId);

      const request = await prisma.attendanceRequest.findUnique({
        where: { id: requestId },
        include: { attendance: true },
      });

      if (!request) return fail(res, 404, "Attendance request not found");
      if (request.status !== AttendanceApprovalStatus.PENDING) {
        return fail(
          res,
          400,
          `Attendance request is already ${String(request.status).toLowerCase()}`,
        );
      }

      const attendance = request.attendance;
      const now = new Date();

      const updated = await prisma.$transaction(async (tx) => {
        await tx.attendanceRequest.update({
          where: { id: request.id },
          data: {
            status: AttendanceApprovalStatus.APPROVED,
            reviewedById: req.user.id,
            reviewedAt: now,
          },
        });

        if (request.type === "CHECK_IN") {
          return tx.attendance.update({
            where: { id: attendance.id },
            data: {
              checkInStatus: AttendanceApprovalStatus.APPROVED,
              checkInApprovedById: req.user.id,
              checkInApprovedAt: now,
            },
            include: attendanceInclude,
          });
        }

        const worked =
          attendance.checkIn && request.eventTime
            ? Math.max(
                0,
                Math.floor(
                  (new Date(request.eventTime).getTime() -
                    new Date(attendance.checkIn).getTime()) /
                    60000,
                ),
              )
            : null;

        return tx.attendance.update({
          where: { id: attendance.id },
          data: {
            checkOutStatus: AttendanceApprovalStatus.APPROVED,
            checkOutApprovedById: req.user.id,
            checkOutApprovedAt: now,
            workedDurationMinutes:
              attendance.checkInStatus === AttendanceApprovalStatus.APPROVED
                ? worked
                : null,
          },
          include: attendanceInclude,
        });
      });

      await audit(
        req,
        "ATTENDANCE_REQUEST_APPROVED",
        "ATTENDANCE_REQUEST",
        requestId,
        { type: request.type, attendanceId: attendance.id },
      );

      res.json(updated);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not approve attendance request");
    }
  },
);

/* 8) POST /api/attendance/requests/:requestId/reject */
app.post(
  "/api/attendance/requests/:requestId/reject",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const requestId = num(req.params.requestId);
      const rejectedReason = String(req.body?.rejectedReason || "").trim();
      if (!rejectedReason) {
        return fail(res, 400, "Rejection reason is required");
      }

      const request = await prisma.attendanceRequest.findUnique({
        where: { id: requestId },
        include: { attendance: true },
      });

      if (!request) return fail(res, 404, "Attendance request not found");
      if (request.status !== AttendanceApprovalStatus.PENDING) {
        return fail(
          res,
          400,
          `Attendance request is already ${String(request.status).toLowerCase()}`,
        );
      }

      const now = new Date();

      const updated = await prisma.$transaction(async (tx) => {
        await tx.attendanceRequest.update({
          where: { id: request.id },
          data: {
            status: AttendanceApprovalStatus.REJECTED,
            reviewedById: req.user.id,
            reviewedAt: now,
            rejectedReason,
          },
        });

        if (request.type === "CHECK_IN") {
          return tx.attendance.update({
            where: { id: request.attendanceId },
            data: {
              checkInStatus: AttendanceApprovalStatus.REJECTED,
              checkInApprovedById: null,
              checkInApprovedAt: null,
            },
            include: attendanceInclude,
          });
        }

        return tx.attendance.update({
          where: { id: request.attendanceId },
          data: {
            checkOutStatus: AttendanceApprovalStatus.REJECTED,
            checkOutApprovedById: null,
            checkOutApprovedAt: null,
            workedDurationMinutes: null,
          },
          include: attendanceInclude,
        });
      });

      await audit(
        req,
        "ATTENDANCE_REQUEST_REJECTED",
        "ATTENDANCE_REQUEST",
        requestId,
        { type: request.type, rejectedReason },
      );

      res.json(updated);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not reject attendance request");
    }
  },
);
/* =========================================================
   OVERTIME
========================================================= */
app.get("/api/overtime", auth, async (req, res) => {
  try {
    const where = {};

    if (req.user.role === Role.EMPLOYEE) {
      where.employeeId = req.user.employeeId;
    } else if (req.query.employeeId) {
      where.employeeId = num(req.query.employeeId);
    }

    if (req.query.status) {
      where.status = String(req.query.status);
    }

    res.json(
      await prisma.overtimeRequest.findMany({
        where,
        orderBy: {
          overtimeDate: "desc",
        },
        take: 500,
      }),
    );
  } catch {
    fail(res, 500, "Could not load overtime");
  }
});
app.post(
  "/api/overtime",
  auth,
  allow(Role.EMPLOYEE, Role.HR, Role.PAYROLL_MANAGER, Role.ADMIN),
  async (req, res) => {
    try {
      let employeeId = req.user.employeeId;

      if (req.user.role !== Role.EMPLOYEE && req.body.employeeId) {
        employeeId = num(req.body.employeeId);
      }

      if (!employeeId || !req.body.overtimeDate || !req.body.durationHours) {
        return fail(
          res,
          400,
          "Employee, overtime date and duration are required",
        );
      }

      const duration = Number(req.body.durationHours);

      if (!Number.isFinite(duration) || duration <= 0) {
        return fail(res, 400, "Duration must be greater than zero");
      }

      const x = await prisma.overtimeRequest.create({
        data: {
          employeeId,
          overtimeDate: dateOnly(req.body.overtimeDate),
          durationHours: duration,
          reason: String(req.body.reason || "").trim() || null,
          status: OvertimeStatus.PENDING,
          requestedAt: new Date(),
        },
      });

      await audit(req, "OVERTIME_REQUESTED", "OVERTIME", x.id, {
        employeeId,
        durationHours: duration,
      });

      const managers = await prisma.user.findMany({
        where: {
          role: {
            in: [Role.ADMIN, Role.HR],
          },
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      for (const manager of managers) {
        await notify(
          manager.id,
          "Overtime request",
          `A new overtime request was submitted for employee ${employeeId}.`,
          "ATTENDANCE",
        );
      }

      res.status(201).json(x);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not create overtime request");
    }
  },
);
app.post(
  "/api/overtime/:id/approve",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id);

      const request = await prisma.overtimeRequest.findUnique({
        where: {
          id,
        },
      });

      if (!request) {
        return fail(res, 404, "Overtime request not found");
      }

      if (request.status !== OvertimeStatus.PENDING) {
        return fail(res, 400, "Only pending overtime requests can be approved");
      }

      const x = await prisma.overtimeRequest.update({
        where: {
          id,
        },
        data: {
          status: OvertimeStatus.APPROVED,
          approvedById: req.user.id,
          approvedAt: new Date(),
        },
      });

      await audit(req, "OVERTIME_APPROVED", "OVERTIME", id, {});

      res.json(x);
    } catch {
      fail(res, 400, "Could not approve overtime");
    }
  },
);
app.post(
  "/api/overtime/:id/reject",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id);

      const x = await prisma.overtimeRequest.update({
        where: {
          id,
        },
        data: {
          status: OvertimeStatus.REJECTED,
          approvedById: req.user.id,
          approvedAt: new Date(),
          rejectedReason: String(req.body.reason || "").trim() || null,
        },
      });

      await audit(req, "OVERTIME_REJECTED", "OVERTIME", id, {
        reason: req.body.reason || null,
      });

      res.json(x);
    } catch {
      fail(res, 400, "Could not reject overtime");
    }
  },
);

/* =========================================================
   LEAVE TYPES  (matches schema)
========================================================= */
app.get("/api/leave-types", auth, async (_req, res) => {
  try {
    res.json(
      await prisma.leaveType.findMany({
        orderBy: { name: "asc" },
      }),
    );
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not load leave types");
  }
});
app.post(
  "/api/leave-types",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const name = String(req.body.name || "").trim();
      if (!name) return fail(res, 400, "Name is required");

      const data = {
        name,
        description: req.body.description || null,
        payment:
          req.body.payment === "UNPAID"
            ? LeavePayment.UNPAID
            : LeavePayment.PAID,
        paymentPolicy: req.body.paymentPolicy || "EMPLOYEE_CHOICE",
        accrualType: req.body.accrualType || "ANNUAL",
        annualEntitlement: num(
          req.body.annualEntitlement ?? req.body.daysPerYear ?? 0,
        ),
        carryForward: num(req.body.carryForward ?? 0),
        requiresReason:
          req.body.requiresReason === undefined
            ? true
            : Boolean(req.body.requiresReason),
        isActive:
          req.body.isActive === undefined ? true : Boolean(req.body.isActive),
      };

      // code is unique; only set if provided (schema defaults cuid())
      if (req.body.code && String(req.body.code).trim()) {
        data.code = String(req.body.code).trim().toUpperCase();
      }

      const x = await prisma.leaveType.create({ data });
      await audit(req, "CREATE", "LEAVE_TYPE", x.id, { name: x.name });
      res.status(201).json(x);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not create leave type");
    }
  },
);
app.patch(
  "/api/leave-types/:id",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const data = {};
      for (const key of [
        "name",
        "description",
        "payment",
        "paymentPolicy",
        "accrualType",
        "requiresReason",
        "isActive",
        "code",
      ]) {
        if (req.body[key] !== undefined) data[key] = req.body[key];
      }
      if (req.body.annualEntitlement !== undefined) {
        data.annualEntitlement = num(req.body.annualEntitlement);
      }
      if (req.body.daysPerYear !== undefined) {
        data.annualEntitlement = num(req.body.daysPerYear);
      }
      if (req.body.carryForward !== undefined) {
        data.carryForward = num(req.body.carryForward);
      }

      const x = await prisma.leaveType.update({
        where: { id: num(req.params.id) },
        data,
      });
      await audit(req, "UPDATE", "LEAVE_TYPE", x.id, {
        fields: Object.keys(data),
      });
      res.json(x);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not update leave type");
    }
  },
);
/* =========================================================
   LEAVE
========================================================= */
app.get("/api/leaves", auth, async (req, res) => {
  try {
    const where = {};

    if (req.user.role === Role.EMPLOYEE) {
      where.employeeId = req.user.employeeId;
    } else if (req.query.employeeId) {
      where.employeeId = num(req.query.employeeId);
    }

    if (req.query.status) {
      where.status = String(req.query.status);
    }

    res.json(
      await prisma.leaveRequest.findMany({
        where,
        include: {
          employee: true,
          leaveType: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 500,
      }),
    );
  } catch {
    fail(res, 500, "Could not load leave requests");
  }
});
app.post("/api/leaves", auth, async (req, res) => {
  try {
    let employeeId = req.user.employeeId;

    if (req.user.role !== Role.EMPLOYEE && req.body.employeeId) {
      employeeId = num(req.body.employeeId);
    }

    if (
      !employeeId ||
      !req.body.leaveTypeId ||
      !req.body.startDate ||
      !req.body.endDate
    ) {
      return fail(
        res,
        400,
        "Employee, leave type, start date and end date are required",
      );
    }

    const startDate = dateOnly(req.body.startDate);

    const endDate = dateOnly(req.body.endDate);

    if (endDate < startDate) {
      return fail(res, 400, "End date cannot be before start date");
    }

    const days = daysBetween(startDate, endDate);

    const leave = await prisma.leaveRequest.create({
        data: {
            employeeId,
            leaveTypeId: num(req.body.leaveTypeId),
            startDate,
            endDate,
            days,
            reason: req.body.reason || null,
            payment:
              req.body.payment === "UNPAID"
                ? LeavePayment.UNPAID
                : LeavePayment.PAID,
            status: LeaveStatus.PENDING,
          },
    });

    await audit(req, "LEAVE_REQUESTED", "LEAVE", leave.id, {
      employeeId,
      days,
    });

    res.status(201).json(leave);
  } catch (e) {
    console.error(e);
    fail(res, 400, "Could not create leave request");
  }
});
app.post(
  "/api/leaves/:id/approve",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id);

      const leave = await prisma.leaveRequest.findUnique({
        where: { id },
        include: { leaveType: true, employee: true },
      });

      if (!leave) return fail(res, 404, "Leave request not found");
      if (leave.status !== LeaveStatus.PENDING) {
        return fail(res, 400, "Only pending leave can be approved");
      }

      const x = await prisma.$transaction(async (tx) => {
        const updated = await tx.leaveRequest.update({
          where: { id },
          data: {
            status: LeaveStatus.APPROVED,
            reviewedById: req.user.id,
            reviewedAt: new Date(),
          },
          include: { leaveType: true, employee: true },
        });

        // Deduct balance for paid leave (payment on type is PAID | UNPAID)
        if (updated.leaveType.payment !== LeavePayment.UNPAID) {
          const year = updated.startDate.getFullYear();
          await tx.leaveBalance.upsert({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId: updated.employeeId,
                leaveTypeId: updated.leaveTypeId,
                year,
              },
            },
            update: {
              used: { increment: Number(updated.days) },
            },
            create: {
              employeeId: updated.employeeId,
              leaveTypeId: updated.leaveTypeId,
              year,
              opening: Number(updated.leaveType.annualEntitlement || 0),
              accrued: 0,
              used: Number(updated.days),
              adjustment: 0,
            },
          });
        }

        return updated;
      });

      await audit(req, "LEAVE_APPROVED", "LEAVE", id, {});
      res.json(x);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not approve leave");
    }
  },
);
app.post(
  "/api/leaves/:id/reject",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id);

      const leave = await prisma.leaveRequest.findUnique({ where: { id } });
      if (!leave) return fail(res, 404, "Leave request not found");

      const x = await prisma.leaveRequest.update({
        where: { id },
        data: {
          status: LeaveStatus.REJECTED,
          reviewedById: req.user.id,
          reviewedAt: new Date(),
          rejectionReason:
            String(req.body.rejectionReason || req.body.reason || "").trim() ||
            null,
        },
      });

      await audit(req, "LEAVE_REJECTED", "LEAVE", id, {
        reason: req.body.rejectionReason || req.body.reason || null,
      });

      res.json(x);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not reject leave");
    }
  },
);
app.get("/api/leave-balances/me", auth, async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.json([]);
    }

    res.json(
      await prisma.leaveBalance.findMany({
        where: {
          employeeId: req.user.employeeId,
        },
        include: {
          leaveType: true,
        },
        orderBy: {
          year: "desc",
        },
      }),
    );
  } catch {
    fail(res, 500, "Could not load leave balances");
  }
});

/* =========================================================
   HOLIDAYS
========================================================= */

app.get("/api/holidays", auth, async (req, res) =>
  res.json(
    await prisma.holiday.findMany({
      where: req.query.year
        ? {
            holidayDate: {
              gte: new Date(num(req.query.year), 0, 1),
              lt: new Date(num(req.query.year) + 1, 0, 1),
            },
          }
        : {},
      orderBy: {
        holidayDate: "asc",
      },
    }),
  ),
);

app.post(
  "/api/holidays",
  auth,
  allow(Role.HR, Role.ADMIN),
  async (req, res) => {
    try {
      const x = await prisma.holiday.create({
        data: {
          name: req.body.name,
          holidayDate: dateOnly(req.body.holidayDate),
          type: req.body.type || "PUBLIC",
          isPaid: req.body.isPaid !== false,
          description: req.body.description || null,
        },
      });

      await audit(req, "CREATE", "HOLIDAY", x.id, {
        name: x.name,
      });

      res.status(201).json(x);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not create holiday");
    }
  },
);

app.patch(
  "/api/holidays/:id",
  auth,
  allow(Role.HR, Role.ADMIN),
  async (req, res) => {
    try {
      const data = {};

      if (req.body.name !== undefined) {
        data.name = req.body.name;
      }

      if (req.body.holidayDate !== undefined) {
        data.holidayDate = dateOnly(req.body.holidayDate);
      }

      if (req.body.type !== undefined) {
        data.type = req.body.type;
      }

      if (req.body.isPaid !== undefined) {
        data.isPaid = Boolean(req.body.isPaid);
      }

      if (req.body.description !== undefined) {
        data.description = req.body.description || null;
      }

      const x = await prisma.holiday.update({
        where: {
          id: num(req.params.id),
        },
        data,
      });

      await audit(req, "UPDATE", "HOLIDAY", x.id, {
        fields: Object.keys(data),
      });

      res.json(x);
    } catch {
      fail(res, 400, "Could not update holiday");
    }
  },
);

app.delete("/api/holidays/:id", auth, allow(Role.ADMIN), async (req, res) => {
  try {
    await prisma.holiday.delete({
      where: {
        id: num(req.params.id),
      },
    });

    await audit(req, "DELETE", "HOLIDAY", num(req.params.id), {});

    res.status(204).end();
  } catch {
    fail(res, 400, "Could not delete holiday");
  }
});

/* =========================================================
   SALARY
========================================================= */

app.get("/api/salary", auth, async (req, res) => {
  try {
    const where =
      req.user.role === Role.EMPLOYEE
        ? {
            employee: {
              user: {
                id: req.user.id,
              },
            },
          }
        : {};

    res.json(
      await prisma.salaryStructure.findMany({
        where,
        include: {
          employee: true,
        },
        orderBy: {
          employeeId: "asc",
        },
        take: 500,
      }),
    );
  } catch {
    fail(res, 500, "Could not load salary");
  }
});

app.put(
  "/api/salary/:employeeId",
  auth,
  allow(Role.PAYROLL_MANAGER, Role.HR, Role.ADMIN),
  async (req, res) => {
    try {
      const employeeId = num(req.params.employeeId);

      const old = await prisma.salaryStructure.findUnique({
        where: {
          employeeId,
        },
      });

      if (!old) {
        return fail(res, 404, "Salary not found");
      }

      const data = {
        basicSalary: num(req.body.basicSalary),
        housingAllowance: num(req.body.housingAllowance),
        transportAllowance: num(req.body.transportAllowance),
        otherAllowance: num(req.body.otherAllowance),
        overtimeRate: num(req.body.overtimeRate),
        effectiveFrom: req.body.effectiveFrom
          ? new Date(req.body.effectiveFrom)
          : old.effectiveFrom,
      };

      const x = await prisma.$transaction(async (tx) => {
        const s = await tx.salaryStructure.update({
          where: {
            employeeId,
          },
          data,
        });

        if (Number(old.basicSalary) !== Number(data.basicSalary)) {
          await tx.salaryChange.create({
            data: {
              employeeId,
              previousBasic: old.basicSalary,
              newBasic: data.basicSalary,
              reason: req.body.reason || "Salary update",
              effectiveFrom: data.effectiveFrom,
              changedById: req.user.id,
            },
          });
        }

        return s;
      });

      await audit(req, "UPDATE", "SALARY", employeeId, {
        previousBasic: String(old.basicSalary),
        newBasic: String(data.basicSalary),
      });

      res.json(x);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not update salary");
    }
  },
);

/* =========================================================
   STATUTORY CONFIGURATION
========================================================= */

app.get(
  "/api/statutory/configs",
  auth,
  allow(Role.ADMIN, Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const where = {};

      if (req.query.scheme) {
        where.scheme = String(req.query.scheme).toUpperCase();
      }

      if (req.query.status) {
        where.status = String(req.query.status).toUpperCase();
      }

      res.json(
        await prisma.statutoryConfig.findMany({
          where,
          orderBy: [
            {
              scheme: "asc",
            },
            {
              version: "desc",
            },
          ],
        }),
      );
    } catch (e) {
      console.error(e);
      fail(res, 500, "Could not load statutory configuration");
    }
  },
);

app.get(
  "/api/statutory/configs/current",
  auth,
  allow(Role.ADMIN, Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const scheme = String(req.query.scheme || "").toUpperCase();

      if (!validStatutoryScheme(scheme)) {
        return fail(res, 400, "Valid statutory scheme is required");
      }

      const now = new Date();

      const config = await prisma.statutoryConfig.findFirst({
        where: {
          scheme,
          status: StatutoryRuleStatus.ACTIVE,
          effectiveFrom: {
            lte: now,
          },
          OR: [
            {
              effectiveTo: null,
            },
            {
              effectiveTo: {
                gte: now,
              },
            },
          ],
        },
        orderBy: [
          {
            effectiveFrom: "desc",
          },
          {
            version: "desc",
          },
        ],
      });

      res.json(config || null);
    } catch {
      fail(res, 500, "Could not load current statutory rule");
    }
  },
);

app.post(
  "/api/statutory/configs",
  auth,
  allow(Role.ADMIN, Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const scheme = String(req.body.scheme || "").toUpperCase();

      if (!validStatutoryScheme(scheme)) {
        return fail(res, 400, "Scheme must be SSF or EPF");
      }

      const version = Number(req.body.version);

      if (!Number.isInteger(version) || version <= 0) {
        return fail(res, 400, "Version must be a positive integer");
      }

      const effectiveFrom = dateOnly(req.body.effectiveFrom);

      const effectiveTo = req.body.effectiveTo
        ? dateOnly(req.body.effectiveTo)
        : null;

      if (effectiveTo && effectiveTo <= effectiveFrom) {
        return fail(
          res,
          400,
          "Effective end date must be after effective start date",
        );
      }

      const baseType = String(req.body.baseType || "BASIC").toUpperCase();

      if (!validStatutoryBaseType(baseType)) {
        return fail(res, 400, "Invalid statutory base type");
      }

      let baseDefinition = req.body.baseDefinition ?? null;

      if (
        baseType === "CUSTOM" &&
        (!baseDefinition || typeof baseDefinition !== "object")
      ) {
        return fail(res, 400, "CUSTOM statutory base requires baseDefinition");
      }

      const employeeRate = validateRate(
        req.body.employeeRate ?? 0,
        "Employee rate",
      );

      const employerRate = validateRate(
        req.body.employerRate ?? 0,
        "Employer rate",
      );

      const existing = await prisma.statutoryConfig.findUnique({
        where: {
          scheme_version: {
            scheme,
            version,
          },
        },
      });

      if (existing) {
        return fail(res, 409, "That statutory rule version already exists");
      }

      const x = await prisma.statutoryConfig.create({
        data: {
          scheme,
          version,
          status: StatutoryRuleStatus.DRAFT,
          effectiveFrom,
          effectiveTo,
          employeeRate,
          employerRate,
          baseType,
          baseDefinition,
          authority: req.body.authority || null,
          referenceNumber: req.body.referenceNumber || null,
          sourceUrl: req.body.sourceUrl || null,
          changeReason: req.body.changeReason || null,
          createdById: req.user.id,
        },
      });

      await audit(req, "STATUTORY_CONFIG_CREATED", "STATUTORY_CONFIG", x.id, {
        scheme,
        version,
      });

      await writeStatutoryAudit({
        action: "CONFIG_CREATED",
        scheme,
        statutoryConfigId: x.id,
        performedById: req.user.id,
        newValues: x,
        reason: req.body.changeReason || null,
        req,
      });

      res.status(201).json(x);
    } catch (e) {
      console.error(e);
      fail(res, 400, e.message || "Could not create statutory configuration");
    }
  },
);

app.post(
  "/api/statutory/configs/:id/activate",
  auth,
  allow(Role.ADMIN, Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const id = num(req.params.id);

      const result = await prisma.$transaction(async (tx) => {
        const config = await tx.statutoryConfig.findUnique({
          where: {
            id,
          },
        });

        if (!config) {
          throw new Error("Statutory configuration not found");
        }

        if (config.status !== StatutoryRuleStatus.DRAFT) {
          throw new Error("Only draft statutory rules can be activated");
        }

        const conflicting = await tx.statutoryConfig.findMany({
          where: {
            scheme: config.scheme,
            status: StatutoryRuleStatus.ACTIVE,
          },
          orderBy: {
            effectiveFrom: "desc",
          },
        });

        for (const current of conflicting) {
          const currentEnd =
            current.effectiveTo || new Date("9999-12-31T00:00:00.000Z");

          const newEnd =
            config.effectiveTo || new Date("9999-12-31T00:00:00.000Z");

          if (
            config.effectiveFrom < currentEnd &&
            current.effectiveFrom < newEnd
          ) {
            if (config.effectiveFrom <= current.effectiveFrom) {
              throw new Error(
                `The new ${config.scheme} rule overlaps an existing active rule`,
              );
            }
          }
        }

        const current = conflicting.find(
          (item) => item.effectiveFrom < config.effectiveFrom,
        );

        if (current) {
          await tx.statutoryConfig.update({
            where: {
              id: current.id,
            },
            data: {
              status: StatutoryRuleStatus.SUPERSEDED,
              effectiveTo: config.effectiveFrom,
              supersededAt: new Date(),
              supersededById: config.id,
            },
          });
        }

        const activated = await tx.statutoryConfig.update({
          where: {
            id,
          },
          data: {
            status: StatutoryRuleStatus.ACTIVE,
            activatedById: req.user.id,
            activatedAt: new Date(),
          },
        });

        return {
          activated,
          previous: current,
        };
      });

      await audit(req, "STATUTORY_CONFIG_ACTIVATED", "STATUTORY_CONFIG", id, {
        scheme: result.activated.scheme,
        version: result.activated.version,
      });

      await writeStatutoryAudit({
        action: "CONFIG_ACTIVATED",
        scheme: result.activated.scheme,
        statutoryConfigId: id,
        performedById: req.user.id,
        oldValues: result.previous,
        newValues: result.activated,
        reason: req.body.reason || result.activated.changeReason || null,
        req,
      });

      res.json(result.activated);
    } catch (e) {
      fail(res, 400, e.message || "Could not activate statutory configuration");
    }
  },
);

app.get(
  "/api/statutory/enrollments",
  auth,
  allow(Role.ADMIN, Role.HR, Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const where = {};

      if (req.query.employeeId) {
        where.employeeId = num(req.query.employeeId);
      }

      if (req.query.scheme) {
        where.scheme = String(req.query.scheme).toUpperCase();
      }

      if (req.query.status) {
        where.status = String(req.query.status).toUpperCase();
      }

      res.json(
        await prisma.statutoryEnrollment.findMany({
          where,
          include: {
            employee: true,
          },
          orderBy: {
            effectiveFrom: "desc",
          },
          take: 1000,
        }),
      );
    } catch {
      fail(res, 500, "Could not load statutory enrollments");
    }
  },
);

app.get("/api/statutory/enrollments/:employeeId", auth, async (req, res) => {
  try {
    const employeeId = num(req.params.employeeId);

    if (req.user.role === Role.EMPLOYEE && !isEmployee(req, employeeId)) {
      return fail(res, 403, "Own statutory information only");
    }

    res.json(
      await prisma.statutoryEnrollment.findMany({
        where: {
          employeeId,
        },
        orderBy: {
          effectiveFrom: "desc",
        },
      }),
    );
  } catch {
    fail(res, 500, "Could not load statutory enrollments");
  }
});

app.post(
  "/api/statutory/enrollments",
  auth,
  allow(Role.ADMIN, Role.HR, Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const employeeId = num(req.body.employeeId);

      const scheme = String(req.body.scheme || "").toUpperCase();

      const status = String(req.body.status || "PENDING").toUpperCase();

      if (!employeeId) {
        return fail(res, 400, "Employee is required");
      }

      if (!validStatutoryScheme(scheme)) {
        return fail(res, 400, "Scheme must be SSF or EPF");
      }

      if (!validEnrollmentStatus(status)) {
        return fail(res, 400, "Invalid enrollment status");
      }

      const effectiveFrom = dateOnly(req.body.effectiveFrom);

      const effectiveTo = req.body.effectiveTo
        ? dateOnly(req.body.effectiveTo)
        : null;

      if (effectiveTo && effectiveTo <= effectiveFrom) {
        return fail(
          res,
          400,
          "Effective end date must be after effective start date",
        );
      }

      const overlapping = await prisma.statutoryEnrollment.findFirst({
        where: {
          employeeId,
          scheme,
          effectiveFrom: {
            lt: effectiveTo || new Date("9999-12-31T00:00:00.000Z"),
          },
          OR: [
            {
              effectiveTo: null,
            },
            {
              effectiveTo: {
                gt: effectiveFrom,
              },
            },
          ],
        },
      });

      if (overlapping) {
        return fail(
          res,
          409,
          "This statutory enrollment overlaps an existing enrollment",
        );
      }

      const x = await prisma.statutoryEnrollment.create({
        data: {
          employeeId,
          scheme,
          status,
          externalId: req.body.externalId || null,
          effectiveFrom,
          effectiveTo,
          reason: req.body.reason || null,
          recordedById: req.user.id,
          recordedAt: new Date(),
          verifiedById:
            status === StatutoryEnrollmentStatus.PENDING ? null : req.user.id,
          verifiedAt:
            status === StatutoryEnrollmentStatus.PENDING ? null : new Date(),
        },
        include: {
          employee: true,
        },
      });

      await audit(
        req,
        "STATUTORY_ENROLLMENT_CREATED",
        "STATUTORY_ENROLLMENT",
        x.id,
        {
          employeeId,
          scheme,
          status,
        },
      );

      await writeStatutoryAudit({
        action: "ENROLLMENT_CREATED",
        scheme,
        enrollmentId: x.id,
        employeeId,
        performedById: req.user.id,
        newValues: x,
        reason: req.body.reason || null,
        req,
      });

      res.status(201).json(x);
    } catch (e) {
      console.error(e);
      fail(res, 400, e.message || "Could not create statutory enrollment");
    }
  },
);

app.patch(
  "/api/statutory/enrollments/:id",
  auth,
  allow(Role.ADMIN, Role.HR, Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const id = num(req.params.id);

      const before = await prisma.statutoryEnrollment.findUnique({
        where: {
          id,
        },
      });

      if (!before) {
        return fail(res, 404, "Statutory enrollment not found");
      }

      const data = {};

      if (req.body.status !== undefined) {
        const status = String(req.body.status).toUpperCase();

        if (!validEnrollmentStatus(status)) {
          return fail(res, 400, "Invalid enrollment status");
        }

        data.status = status;
      }

      if (req.body.externalId !== undefined) {
        data.externalId = req.body.externalId || null;
      }

      if (req.body.effectiveTo !== undefined) {
        data.effectiveTo = req.body.effectiveTo
          ? dateOnly(req.body.effectiveTo)
          : null;
      }

      if (req.body.reason !== undefined) {
        data.reason = req.body.reason || null;
      }

      const effectiveTo =
        data.effectiveTo !== undefined ? data.effectiveTo : before.effectiveTo;

      if (effectiveTo && effectiveTo <= before.effectiveFrom) {
        return fail(
          res,
          400,
          "Effective end date must be after effective start date",
        );
      }

      const status = data.status || before.status;

      if (status !== StatutoryEnrollmentStatus.PENDING) {
        data.verifiedById = req.user.id;
        data.verifiedAt = new Date();
      }

      const x = await prisma.statutoryEnrollment.update({
        where: {
          id,
        },
        data,
      });

      await audit(
        req,
        "STATUTORY_ENROLLMENT_UPDATED",
        "STATUTORY_ENROLLMENT",
        id,
        {
          changes: changedFields(before, x, Object.keys(data)),
        },
      );

      await writeStatutoryAudit({
        action: "ENROLLMENT_UPDATED",
        scheme: x.scheme,
        enrollmentId: x.id,
        employeeId: x.employeeId,
        performedById: req.user.id,
        oldValues: before,
        newValues: x,
        reason: req.body.reason || null,
        req,
      });

      res.json(x);
    } catch {
      fail(res, 400, "Could not update statutory enrollment");
    }
  },
);

/* =========================================================
   PAYROLL
========================================================= */

app.get("/api/payroll", auth, async (req, res) => {
  try {
    const where =
      req.user.role === Role.EMPLOYEE
        ? {
            employee: {
              user: {
                id: req.user.id,
              },
            },
          }
        : {};

    res.json(
      await prisma.payrollPeriod.findMany({
        orderBy: [
          {
            year: "desc",
          },
          {
            month: "desc",
          },
        ],
        include: {
          _count: {
            select: {
              records: true,
            },
          },
          records: {
            where,
            include: {
              employee: true,
              payslip: true,
              period: true,
            },
            orderBy: {
              employeeId: "asc",
            },
            take: 1000,
          },
        },
      }),
    );
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not load payroll");
  }
});

app.post(
  "/api/payroll/process",
  auth,
  allow(Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const year = num(req.body.year);
      const month = num(req.body.month);

      if (!year || month < 1 || month > 12) {
        return fail(res, 400, "Valid year and month are required");
      }

      const existing = await prisma.payrollPeriod.findUnique({
        where: {
          year_month: {
            year,
            month,
          },
        },
      });

      if (
        existing &&
        ["HR_APPROVED", "ADMIN_APPROVED", "PAID", "LOCKED"].includes(
          existing.status,
        )
      ) {
        return fail(
          res,
          400,
          "This payroll period is already approved or locked",
        );
      }

      const period = await prisma.payrollPeriod.upsert({
        where: {
          year_month: {
            year,
            month,
          },
        },
        update: {
          status: PayrollStatus.PROCESSING,
          hrApprovedById: null,
          hrApprovedAt: null,
          adminApprovedById: null,
          adminApprovedAt: null,
          paidAt: null,
          lockedAt: null,
        },
        create: {
          year,
          month,
          status: PayrollStatus.PROCESSING,
        },
      });

      const taxBrackets = await prisma.taxBracket.findMany({
        where: {
          isActive: true,
          effectiveFrom: {
            lte: new Date(year, month - 1, 1),
          },
        },
        orderBy: {
          effectiveFrom: "desc",
        },
      });

      const latestByLower = new Map();

      for (const b of taxBrackets) {
        const key = String(b.lowerBound);

        if (!latestByLower.has(key)) {
          latestByLower.set(key, b);
        }
      }

      const brackets = [...latestByLower.values()];

      const start = new Date(year, month - 1, 1);

      const end = new Date(year, month, 1);

      const [holidays, employees] = await Promise.all([
        prisma.holiday.findMany({
          where: {
            holidayDate: {
              gte: start,
              lt: end,
            },
            isPaid: false,
          },
          select: {
            holidayDate: true,
          },
        }),

        prisma.employee.findMany({
          where: {
            status: "ACTIVE",
          },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            salary: true,
            leaves: {
              where: {
                status: LeaveStatus.APPROVED,
                startDate: {
                  lt: end,
                },
                endDate: {
                  gte: start,
                },
              },
              include: {
                leaveType: true,
              },
            },
            overtimeRequests: {
              where: {
                overtimeDate: {
                  gte: start,
                  lt: end,
                },
                status: OvertimeStatus.APPROVED,
              },
              select: {
                durationHours: true,
                overtimeDate: true,
              },
            },
          },
        }),
      ]);

      const holidaySet = new Set(
        holidays.map((h) => dateOnly(h.holidayDate).getTime()),
      );

      let workingDays = 0;

      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        if (
          d.getDay() !== 0 &&
          d.getDay() !== 6 &&
          !holidaySet.has(dateOnly(d).getTime())
        ) {
          workingDays++;
        }
      }

      const statutoryCache = new Map();

      for (const employee of employees) {
        if (!employee.salary) {
          continue;
        }

        const unpaidLeaveDays = employee.leaves
          .filter((leave) => leave.leaveType.payment === LeavePayment.UNPAID)
          .reduce((sum, leave) => sum + Number(leave.days), 0);

        const statutoryRules = await getEmployeeStatutoryRules(
          employee.id,
          year,
          month,
        );

        statutoryCache.set(employee.id, statutoryRules);

        const calc = calculatePayroll({
          salary: employee.salary,
          overtimeRequests: employee.overtimeRequests,
          taxBrackets: brackets,
          unpaidLeaveDays,
          workingDays,
          statutory: {
            rules: statutoryRules,
          },
        });

        if (!Number.isFinite(Number(calc.net))) {
          throw new Error(
            `Payroll calculation returned an invalid net amount for employee ${employee.id}`,
          );
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.payrollRecord.deleteMany({
          where: {
            periodId: period.id,
          },
        });

        for (const e of employees) {
          if (!e.salary) {
            continue;
          }

          const unpaidLeaveDays = e.leaves
            .filter((l) => l.leaveType.payment === LeavePayment.UNPAID)
            .reduce((sum, l) => sum + Number(l.days), 0);

          const statutoryRules = statutoryCache.get(e.id) || [];

          const calc = calculatePayroll({
            salary: e.salary,
            overtimeRequests: e.overtimeRequests,
            taxBrackets: brackets,
            unpaidLeaveDays,
            workingDays,
            statutory: {
              rules: statutoryRules,
            },
          });

          const record = await tx.payrollRecord.create({
            data: {
              periodId: period.id,
              employeeId: e.id,
              basic: calc.basic,
              allowances: calc.allowances,
              overtime: calc.overtime,
              unpaidLeaveDeduction: calc.unpaidLeaveDeduction,
              gross: calc.gross,
              employeeSSF: calc.employeeSSF,
              employeePF: calc.employeePF,
              tax: calc.tax,
              otherDeductions: calc.otherDeductions,
              adjustment: calc.adjustment,
              net: calc.net,
              employerSSF: calc.employerSSF,
              employerPF: calc.employerPF,
              ssfRuleVersion: calc.ssfRuleVersion,
              epfRuleVersion: calc.epfRuleVersion,
              calculatedAt: new Date(),
              calculatedById: req.user.id,
              payslip: {
                create: {},
              },
            },
          });

          for (const rule of statutoryRules) {
            await tx.statutoryAuditLog
              .create({
                data: {
                  action: "PAYROLL_CALCULATED",
                  scheme: rule.scheme,
                  statutoryConfigId: rule.id,
                  enrollmentId: rule.enrollmentId,
                  employeeId: e.id,
                  payrollRecordId: record.id,
                  performedById: req.user.id,
                  newValues: {
                    ruleVersion: rule.version,
                    employeeContribution: rule.employeeRate,
                    employerContribution: rule.employerRate,
                  },
                },
                reason: "Payroll calculation snapshot",
                ipAddress: clientIp(req),
                userAgent: req.headers["user-agent"] || null,
              })
              .catch(() => {});
          }
        }
      });

      const out = await prisma.payrollPeriod.update({
        where: {
          id: period.id,
        },
        data: {
          status: PayrollStatus.PROCESSED,
        },
        include: {
          _count: {
            select: {
              records: true,
            },
          },
        },
      });

      await audit(req, "GENERATE", "PAYROLL", period.id, {
        year,
        month,
        employees: employees.length,
        taxConfiguration: brackets.map((x) => x.label),
      });

      res.json(out);
    } catch (e) {
      console.error(e);

      fail(res, 400, e.message || "Payroll processing failed");
    }
  },
);

app.post(
  "/api/payroll/:id/hr-approve",
  auth,
  allow(Role.HR),
  async (req, res) => {
    try {
      const p = await prisma.payrollPeriod.findUnique({
        where: {
          id: num(req.params.id),
        },
      });

      if (!p || p.status !== PayrollStatus.PROCESSED) {
        return fail(res, 400, "Payroll is not ready for HR approval");
      }

      const x = await prisma.payrollPeriod.update({
        where: {
          id: p.id,
        },
        data: {
          status: PayrollStatus.HR_APPROVED,
          hrApprovedById: req.user.id,
          hrApprovedAt: new Date(),
        },
      });

      await audit(req, "PAYROLL_APPROVED", "PAYROLL", p.id, {
        stage: "HR",
      });

      res.json(x);
    } catch {
      fail(res, 400, "HR approval failed");
    }
  },
);

app.post(
  "/api/payroll/:id/admin-approve",
  auth,
  allow(Role.ADMIN),
  async (req, res) => {
    try {
      const p = await prisma.payrollPeriod.findUnique({
        where: {
          id: num(req.params.id),
        },
      });

      if (!p || p.status !== PayrollStatus.HR_APPROVED) {
        return fail(res, 400, "Payroll requires HR approval first");
      }

      const x = await prisma.payrollPeriod.update({
        where: {
          id: p.id,
        },
        data: {
          status: PayrollStatus.ADMIN_APPROVED,
          adminApprovedById: req.user.id,
          adminApprovedAt: new Date(),
        },
      });

      await audit(req, "PAYROLL_APPROVED", "PAYROLL", p.id, {
        stage: "ADMIN",
      });

      res.json(x);
    } catch {
      fail(res, 400, "Admin approval failed");
    }
  },
);

app.post(
  "/api/payroll/:id/pay",
  auth,
  allow(Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const p = await prisma.payrollPeriod.findUnique({
        where: {
          id: num(req.params.id),
        },
      });

      if (!p || p.status !== PayrollStatus.ADMIN_APPROVED) {
        return fail(res, 400, "Payroll requires HR and Admin approval");
      }

      const x = await prisma.payrollPeriod.update({
        where: {
          id: p.id,
        },
        data: {
          status: PayrollStatus.PAID,
          paidAt: new Date(),
        },
      });

      await audit(req, "MARK_PAID", "PAYROLL", p.id, {});

      res.json(x);
    } catch {
      fail(res, 400, "Could not mark payroll paid");
    }
  },
);

app.post(
  "/api/payroll/:id/lock",
  auth,
  allow(Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const p = await prisma.payrollPeriod.findUnique({
        where: {
          id: num(req.params.id),
        },
      });

      if (!p || p.status !== PayrollStatus.PAID) {
        return fail(res, 400, "Only paid payroll can be locked");
      }

      const x = await prisma.payrollPeriod.update({
        where: {
          id: p.id,
        },
        data: {
          status: PayrollStatus.LOCKED,
          lockedAt: new Date(),
        },
      });

      await audit(req, "LOCK", "PAYROLL", p.id, {});

      res.json(x);
    } catch {
      fail(res, 400, "Could not lock payroll");
    }
  },
);

/* =========================================================
   PAYSLIPS
========================================================= */

app.get("/api/payslips/:id", auth, async (req, res) => {
  try {
    const p = await prisma.payslip.findUnique({
      where: {
        id: num(req.params.id),
      },
      include: {
        payrollRecord: {
          include: {
            employee: {
              include: {
                department: true,
                designation: true,
                branch: true,
              },
            },
            period: true,
          },
        },
      },
    });

    if (!p) {
      return fail(res, 404, "Payslip not found");
    }

    if (
      req.user.role === Role.EMPLOYEE &&
      !isEmployee(req, p.payrollRecord.employeeId)
    ) {
      return fail(res, 403, "Own payslip only");
    }

    res.json(p);
  } catch {
    fail(res, 500, "Could not load payslip");
  }
});

app.get("/api/payslips/:id/pdf", auth, async (req, res) => {
  try {
    const p = await prisma.payslip.findUnique({
      where: {
        id: num(req.params.id),
      },
      include: {
        payrollRecord: {
          include: {
            employee: {
              include: {
                department: true,
                designation: true,
                branch: true,
              },
            },
            period: true,
          },
        },
      },
    });

    if (!p) {
      return fail(res, 404, "Payslip not found");
    }

    const r = p.payrollRecord;

    if (req.user.role === Role.EMPLOYEE && !isEmployee(req, r.employeeId)) {
      return fail(res, 403, "Own payslip only");
    }

    const doc = new PDFDocument({
      margin: 50,
    });

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      `inline; filename="payslip-${r.employee.employeeCode}-${r.period.year}-${String(
        r.period.month,
      ).padStart(2, "0")}.pdf"`,
    );

    doc.pipe(res);

    doc.fontSize(20).text("PAYROLLPRO", {
      align: "center",
    });

    doc.fontSize(10).text("Enterprise Payroll & HR Management System", {
      align: "center",
    });

    doc.text("Employee Payslip", {
      align: "center",
    });

    doc.moveDown();

    doc
      .fontSize(11)
      .text(`Employee: ${r.employee.firstName} ${r.employee.lastName}`);

    doc.text(`Employee Code: ${r.employee.employeeCode}`);

    doc.text(`Department: ${r.employee.department?.name || "—"}`);

    doc.text(`Designation: ${r.employee.designation?.title || "—"}`);

    doc.text(`Branch: ${r.employee.branch?.name || "—"}`);

    doc.text(
      `Payroll Period: ${r.period.year}-${String(r.period.month).padStart(
        2,
        "0",
      )}`,
    );

    doc.text(
      `Payroll Reference: PP-${r.period.year}${String(r.period.month).padStart(
        2,
        "0",
      )}-${r.id}`,
    );

    doc.moveDown();

    const lines = [
      ["Basic Salary", r.basic],
      ["Allowances", r.allowances],
      ["Overtime", r.overtime],
      ["Unpaid Leave Deduction", -Number(r.unpaidLeaveDeduction)],
      ["Gross Pay", r.gross],
      ["Employee SSF", -Number(r.employeeSSF)],
      ["Employee PF", -Number(r.employeePF)],
      ["Tax", -Number(r.tax)],
      ["Other Deductions", -Number(r.otherDeductions)],
      ["Adjustment", r.adjustment],
      ["NET PAY", r.net],
    ];

    for (const [label, value] of lines) {
      doc.text(`${String(label).padEnd(24)} ${Number(value).toFixed(2)}`);
    }

    doc.moveDown();

    doc
      .fontSize(9)
      .text(
        "Generated by PayrollPro. Statutory calculations use the active configuration stored in the system.",
      );

    doc.end();
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not generate payslip PDF");
  }
});

/* =========================================================
   TAX
========================================================= */

app.get(
  "/api/tax-brackets",
  auth,
  allow(Role.ADMIN, Role.HR, Role.PAYROLL_MANAGER),
  async (_req, res) => {
    try {
      res.json(
        await prisma.taxBracket.findMany({
          orderBy: [
            {
              effectiveFrom: "desc",
            },
            {
              lowerBound: "asc",
            },
          ],
        }),
      );
    } catch {
      fail(res, 500, "Could not load tax configuration");
    }
  },
);

app.post("/api/tax-brackets", auth, allow(Role.ADMIN), async (req, res) => {
  try {
    const {
      label,
      lowerBound,
      upperBound,
      rate,
      fixedTax = 0,
      effectiveFrom,
      isActive = true,
    } = req.body;

    if (
      !label ||
      lowerBound === undefined ||
      rate === undefined ||
      !effectiveFrom
    ) {
      return fail(res, 400, "Tax bracket fields are required");
    }

    const x = await prisma.taxBracket.create({
      data: {
        label,
        lowerBound: num(lowerBound),
        upperBound:
          upperBound === "" || upperBound == null ? null : num(upperBound),
        rate: num(rate),
        fixedTax: num(fixedTax),
        effectiveFrom: dateOnly(effectiveFrom),
        isActive: Boolean(isActive),
      },
    });

    await audit(req, "CREATE", "TAX_BRACKET", x.id, {
      label,
    });

    res.status(201).json(x);
  } catch (e) {
    console.error(e);
    fail(res, 400, "Could not create tax bracket");
  }
});

app.patch(
  "/api/tax-brackets/:id",
  auth,
  allow(Role.ADMIN),
  async (req, res) => {
    try {
      const data = {};

      for (const k of ["label", "isActive"]) {
        if (req.body[k] !== undefined) {
          data[k] = req.body[k];
        }
      }

      for (const k of ["lowerBound", "upperBound", "rate", "fixedTax"]) {
        if (req.body[k] !== undefined) {
          data[k] =
            req.body[k] === null || req.body[k] === ""
              ? null
              : num(req.body[k]);
        }
      }

      if (req.body.effectiveFrom) {
        data.effectiveFrom = dateOnly(req.body.effectiveFrom);
      }

      const x = await prisma.taxBracket.update({
        where: {
          id: num(req.params.id),
        },
        data,
      });

      await audit(req, "UPDATE", "TAX_BRACKET", x.id, {
        fields: Object.keys(data),
      });

      res.json(x);
    } catch {
      fail(res, 400, "Could not update tax bracket");
    }
  },
);

/* =========================================================
   USERS
========================================================= */

app.get("/api/users", auth, allow(Role.ADMIN), async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(users);
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not load users");
  }
});

app.post("/api/users", auth, allow(Role.ADMIN), async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const role = String(req.body.role || "").trim();

    const allowedRoles = [Role.ADMIN, Role.HR, Role.PAYROLL_MANAGER];

    if (!email || !role) {
      return fail(res, 400, "Email and role are required");
    }

    if (!allowedRoles.includes(role)) {
      return fail(
        res,
        400,
        "Only Admin, HR, and Payroll Manager accounts can be created here",
      );
    }

    const limits = await prisma.accountLimit.upsert({
      where: {
        id: 1,
      },
      update: {},
      create: {
        id: 1,
        maxAdmins: 3,
        maxHr: 10,
        maxPayrollManagers: 5,
      },
    });

    const roleLimit = {
      [Role.ADMIN]: limits.maxAdmins,
      [Role.HR]: limits.maxHr,
      [Role.PAYROLL_MANAGER]: limits.maxPayrollManagers,
    }[role];

    const activeCount = await prisma.user.count({
      where: {
        role,
        isActive: true,
      },
    });

    if (activeCount >= roleLimit) {
      return fail(
        res,
        409,
        `${role.replace(
          "_",
          " ",
        )} account limit reached (${activeCount}/${roleLimit})`,
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        isActive: true,
        role: true,
      },
    });

    if (existingUser) {
      return fail(
        res,
        409,
        existingUser.isActive
          ? "An account with this email already exists"
          : "An account with this email already exists but is inactive",
      );
    }

    const raw = randomToken();

    const hash = await passwordHash(crypto.randomBytes(24).toString("hex"));

    const user = await prisma.user.create({
      data: {
        employeeId: null,
        email,
        passwordHash: hash,
        role,
        mustChangePassword: true,
      },
    });

    const tokenHash = hashToken(raw);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        type: PasswordTokenType.ACTIVATION,
      },
    });

    await audit(req, "ACCOUNT_CREATED", "USER", user.id, {
      role,
      accountType: "SYSTEM_ACCOUNT",
    });

    await notify(
      user.id,
      "Account created",
      "Your PayrollPro account was created. Use the secure activation link to set your password.",
      "SECURITY",
    );

    const activationUrl = `${
      process.env.CLIENT_URL || "http://localhost:5173"
    }/?reset=${raw}`;

    await sendSecurityEmail({
      to: user.email,
      subject: "Your PayrollPro account",
      html: `
          <p>Your PayrollPro account has been created.</p>
          <p><strong>Role:</strong> ${role.replace("_", " ")}</p>
          <p><a href="${activationUrl}">Activate your account and set your password</a></p>
          <p>This link expires in 24 hours.</p>
        `,
    }).catch(() => {});

    res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      employee: null,
      activationToken: process.env.NODE_ENV === "production" ? undefined : raw,
    });
  } catch (e) {
    console.error(e);

    fail(
      res,
      400,
      e.code === "P2002"
        ? "An account with this email already exists"
        : "Could not create account",
    );
  }
});

app.patch(
  "/api/users/:id/status",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id);
      const active = Boolean(req.body.isActive);

      const target = await prisma.user.findUnique({
        where: {
          id,
        },
      });

      if (!target) {
        return fail(res, 404, "User not found");
      }

      if (target.role === Role.ADMIN && req.user.id !== target.id) {
        return fail(res, 403, "Only the same Admin can manage this account");
      }

      if (req.user.role === Role.HR && target.role !== Role.EMPLOYEE) {
        return fail(res, 403, "HR can only manage employee accounts");
      }

      const user = await prisma.user.update({
        where: {
          id,
        },
        data: {
          isActive: active,
        },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
        },
      });

      await audit(
        req,
        active ? "ACCOUNT_REACTIVATED" : "ACCOUNT_DEACTIVATED",
        "USER",
        id,
        {
          role: target.role,
        },
      );

      await security(
        req,
        id,
        active ? "ACCOUNT_REACTIVATED" : "ACCOUNT_DEACTIVATED",
        {
          actor: req.user.id,
        },
      );

      await notify(
        id,
        active ? "Account reactivated" : "Account deactivated",
        active
          ? "Your PayrollPro account has been reactivated."
          : "Your PayrollPro account has been deactivated.",
        "SECURITY",
      );

      res.json(user);
    } catch {
      fail(res, 400, "Could not update account");
    }
  },
);

app.post(
  "/api/users/:id/force-password-reset",
  auth,
  allow(Role.ADMIN),
  async (req, res) => {
    try {
      const id = num(req.params.id);

      const target = await prisma.user.findUnique({
        where: {
          id,
        },
      });

      if (!target) {
        return fail(res, 404, "User not found");
      }

      await prisma.user.update({
        where: {
          id,
        },
        data: {
          mustChangePassword: true,
        },
      });

      await audit(req, "ADMIN_FORCED_PASSWORD_RESET", "USER", id, {
        targetRole: target.role,
      });

      await security(req, id, "ADMIN_FORCED_PASSWORD_RESET", {
        actor: req.user.id,
      });

      await notify(
        id,
        "Security alert",
        "An administrator requires you to change your PayrollPro password at your next sign-in.",
        "SECURITY",
      );

      res.json({
        message: "Password change required at next sign-in",
      });
    } catch {
      fail(res, 400, "Could not force password reset");
    }
  },
);

/* =========================================================
   PAYROLL CSV
========================================================= */

app.get(
  "/api/reports/payroll.csv",
  auth,
  allow(Role.ADMIN, Role.HR, Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const year = num(req.query.year);

      const month = num(req.query.month);

      const period = await prisma.payrollPeriod.findUnique({
        where: {
          year_month: {
            year,
            month,
          },
        },
        include: {
          records: {
            include: {
              employee: true,
            },
          },
        },
      });

      if (!period) {
        return fail(res, 404, "Payroll period not found");
      }

      const rows = [
        [
          "Employee Code",
          "Employee Name",
          "Basic",
          "Allowances",
          "Overtime",
          "Unpaid Leave Deduction",
          "Gross",
          "Employee SSF",
          "Employee PF",
          "Tax",
          "Other Deductions",
          "Net",
          "Employer SSF",
          "Employer PF",
          "Status",
        ],
      ];

      for (const r of period.records) {
        rows.push([
          r.employee.employeeCode,
          `${r.employee.firstName} ${r.employee.lastName}`,
          r.basic,
          r.allowances,
          r.overtime,
          r.unpaidLeaveDeduction,
          r.gross,
          r.employeeSSF,
          r.employeePF,
          r.tax,
          r.otherDeductions,
          r.net,
          r.employerSSF,
          r.employerPF,
          period.status,
        ]);
      }

      const csv = rows
        .map((row) =>
          row
            .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
            .join(","),
        )
        .join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="payroll-${year}-${String(month).padStart(
          2,
          "0",
        )}.csv"`,
      );

      res.send(csv);
    } catch (e) {
      console.error(e);
      fail(res, 500, "Could not export payroll");
    }
  },
);

/* =========================================================
   PERFORMANCE
========================================================= */

app.get("/api/performance/cycles", auth, async (_req, res) => {
  try {
    res.json(
      await prisma.performanceCycle.findMany({
        include: {
          _count: {
            select: {
              goals: true,
              reviews: true,
            },
          },
        },
        orderBy: {
          year: "desc",
        },
      }),
    );
  } catch {
    fail(res, 500, "Could not load performance cycles");
  }
});

app.post("/api/performance/cycles", auth, allow(Role.HR), async (req, res) => {
  try {
    const x = await prisma.performanceCycle.create({
      data: {
        name: req.body.name,
        year: num(req.body.year),
        startDate: dateOnly(req.body.startDate),
        endDate: dateOnly(req.body.endDate),
        status: PerformanceStatus.OPEN,
      },
    });

    await audit(req, "CREATE", "PERFORMANCE_CYCLE", x.id, {
      name: x.name,
    });

    res.status(201).json(x);
  } catch (e) {
    console.error(e);
    fail(res, 400, "Could not create performance cycle");
  }
});

app.post("/api/performance/goals", auth, allow(Role.HR), async (req, res) => {
  try {
    const x = await prisma.performanceGoal.create({
      data: {
        cycleId: num(req.body.cycleId),
        employeeId: num(req.body.employeeId),
        title: req.body.title,
        description: req.body.description || null,
        weight: num(req.body.weight),
        target: req.body.target === undefined ? null : num(req.body.target),
        actual: req.body.actual === undefined ? null : num(req.body.actual),
      },
    });

    if (Array.isArray(req.body.kpis)) {
      for (const k of req.body.kpis) {
        await prisma.employeeKPI.create({
          data: {
            goalId: x.id,
            employeeId: x.employeeId,
            name: k.name,
            weight: num(k.weight),
          },
        });
      }
    }

    await audit(req, "CREATE", "PERFORMANCE_GOAL", x.id, {
      employeeId: x.employeeId,
    });

    res.status(201).json(x);
  } catch (e) {
    console.error(e);
    fail(res, 400, "Could not create goal");
  }
});

app.get("/api/performance/me", auth, async (req, res) => {
  try {
    const u = await prisma.user.findUnique({
      where: {
        id: req.user.id,
      },
      select: {
        employeeId: true,
      },
    });

    if (!u.employeeId) {
      return res.json({
        goals: [],
        reviews: [],
      });
    }

    const [goals, reviews, avg] = await Promise.all([
      prisma.performanceGoal.findMany({
        where: {
          employeeId: u.employeeId,
        },
        include: {
          kpis: true,
          cycle: true,
        },
        orderBy: {
          id: "desc",
        },
      }),

      prisma.performanceReview.findMany({
        where: {
          employeeId: u.employeeId,
        },
        include: {
          cycle: true,
        },
        orderBy: {
          id: "desc",
        },
      }),

      prisma.performanceReview.aggregate({
        _avg: {
          finalScore: true,
        },
        where: {
          employeeId: u.employeeId,
          finalScore: {
            not: null,
          },
        },
      }),
    ]);

    res.json({
      goals,
      reviews,
      average: num(avg._avg.finalScore),
    });
  } catch {
    fail(res, 500, "Could not load performance");
  }
});

app.post("/api/performance/reviews", auth, async (req, res) => {
  try {
    let employeeId = num(req.body.employeeId);

    if (req.user.role === Role.EMPLOYEE) {
      const u = await prisma.user.findUnique({
        where: {
          id: req.user.id,
        },
        select: {
          employeeId: true,
        },
      });

      employeeId = u.employeeId;
    }

    if (!employeeId) {
      return fail(res, 400, "Employee required");
    }

    const x = await prisma.performanceReview.upsert({
      where: {
        cycleId_employeeId: {
          cycleId: num(req.body.cycleId),
          employeeId,
        },
      },
      update: {
        selfComment: req.body.selfComment,
        selfRating:
          req.body.selfRating === undefined
            ? undefined
            : num(req.body.selfRating),
      },
      create: {
        cycleId: num(req.body.cycleId),
        employeeId,
        selfComment: req.body.selfComment || null,
        selfRating:
          req.body.selfRating === undefined ? null : num(req.body.selfRating),
      },
    });

    await audit(req, "SAVE", "PERFORMANCE_REVIEW", x.id, {
      employeeId,
    });

    res.json(x);
  } catch (e) {
    console.error(e);
    fail(res, 400, "Could not save review");
  }
});

app.patch(
  "/api/performance/reviews/:id",
  auth,
  allow(Role.HR),
  async (req, res) => {
    try {
      const r = await prisma.performanceReview.findUnique({
        where: {
          id: num(req.params.id),
        },
        include: {
          employee: true,
        },
      });

      if (!r) {
        return fail(res, 404, "Review not found");
      }

      const score =
        req.body.finalScore === undefined ? null : num(req.body.finalScore);

      const grade =
        score === null
          ? null
          : score >= 90
            ? "OUTSTANDING"
            : score >= 80
              ? "EXCELLENT"
              : score >= 70
                ? "GOOD"
                : score >= 60
                  ? "SATISFACTORY"
                  : "NEEDS IMPROVEMENT";

      const x = await prisma.performanceReview.update({
        where: {
          id: r.id,
        },
        data: {
          managerComment: req.body.managerComment,
          managerRating:
            req.body.managerRating === undefined
              ? undefined
              : num(req.body.managerRating),
          finalScore: score,
          grade,
          completedAt: score === null ? null : new Date(),
        },
      });

      await audit(req, "COMPLETE", "PERFORMANCE_REVIEW", r.id, {
        score,
        grade,
      });

      res.json(x);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not update review");
    }
  },
);

/* =========================================================
   REPORTS / CONCERNS
========================================================= */

app.get("/api/reports/concerns", auth, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    const where =
      req.user.role === Role.EMPLOYEE
        ? {
            reporterId: req.user.id,
          }
        : {};

    if (q) {
      where.OR = [
        {
          reportCode: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          subject: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          category: {
            contains: q,
            mode: "insensitive",
          },
        },
      ];
    }

    const rows = await prisma.report.findMany({
      where,
      include: {
        reporter: {
          select: {
            id: true,
            email: true,
            role: true,
            employee: {
              select: {
                employeeCode: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        relatedEmployee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
        relatedDepartment: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
    });

    res.json(rows);
  } catch {
    fail(res, 500, "Could not load reports");
  }
});

app.post("/api/reports/concerns", auth, async (req, res) => {
  try {
    const {
      category,
      subject,
      description,
      relatedEmployeeId,
      relatedDepartmentId,
      priority = "NORMAL",
      isConfidential = false,
      attachmentUrl,
    } = req.body;

    if (!category || !subject || !description) {
      return fail(res, 400, "Category, subject and description are required");
    }

    const reportCode =
      "RP-" + new Date().getFullYear() + "-" + String(Date.now()).slice(-6);

    const relatedEmployee = relatedEmployeeId ? num(relatedEmployeeId) : null;

    const r = await prisma.report.create({
      data: {
        reportCode,
        reporterId: req.user.id,
        relatedEmployeeId: relatedEmployee || null,
        relatedDepartmentId: relatedDepartmentId
          ? num(relatedDepartmentId)
          : null,
        category: String(category),
        subject: String(subject),
        description: String(description),
        priority: String(priority),
        isConfidential: Boolean(isConfidential),
        attachmentUrl: attachmentUrl || null,
        updates: {
          create: {
            userId: req.user.id,
            message: "Report submitted",
            status: "SUBMITTED",
            isInternal: false,
          },
        },
      },
      include: {
        reporter: {
          select: {
            email: true,
            employee: {
              select: {
                employeeCode: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    const managers = await prisma.user.findMany({
      where: {
        role: {
          in: [Role.ADMIN, Role.HR],
        },
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    for (const m of managers) {
      await notify(
        m.id,
        "New employee report",
        `${r.reportCode}: ${r.subject}`,
        "REPORT",
      );
    }

    await audit(req, "REPORT_SUBMITTED", "REPORT", r.id, {
      category: r.category,
      priority: r.priority,
      confidential: r.isConfidential,
    });

    res.status(201).json(r);
  } catch (e) {
    console.error(e);
    fail(res, 400, "Could not submit report");
  }
});

app.get("/api/reports/concerns/:id", auth, async (req, res) => {
  try {
    const r = await prisma.report.findUnique({
      where: {
        id: num(req.params.id),
      },
      include: {
        reporter: {
          select: {
            id: true,
            email: true,
            role: true,
            employee: {
              select: {
                employeeCode: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        relatedEmployee: true,
        relatedDepartment: true,
        assignedTo: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        updates: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            user: {
              select: {
                email: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!r) {
      return fail(res, 404, "Report not found");
    }

    if (req.user.role === Role.EMPLOYEE && r.reporterId !== req.user.id) {
      return fail(res, 403, "Own reports only");
    }

    if (r.isConfidential && req.user.role === Role.PAYROLL_MANAGER) {
      return fail(res, 403, "Confidential report restricted");
    }

    res.json(r);
  } catch {
    fail(res, 500, "Could not load report");
  }
});

app.patch(
  "/api/reports/concerns/:id",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id);

      const before = await prisma.report.findUnique({
        where: {
          id,
        },
      });

      if (!before) {
        return fail(res, 404, "Report not found");
      }

      const data = {};

      for (const k of ["status", "priority", "assignedToId"]) {
        if (req.body[k] !== undefined) {
          data[k] =
            k === "assignedToId"
              ? req.body[k]
                ? num(req.body[k])
                : null
              : String(req.body[k]);
        }
      }

      const r = await prisma.$transaction(async (tx) => {
        const x = await tx.report.update({
          where: {
            id,
          },
          data,
        });

        if (req.body.message) {
          await tx.reportUpdate.create({
            data: {
              reportId: id,
              userId: req.user.id,
              status: x.status,
              message: String(req.body.message),
              isInternal: Boolean(req.body.isInternal),
            },
          });
        }

        return x;
      });

      await audit(req, "REPORT_UPDATED", "REPORT", id, {
        changes: changedFields(before, r, [
          "status",
          "priority",
          "assignedToId",
        ]),
      });

      await notify(
        before.reporterId,
        "Report updated",
        `${before.reportCode} has been updated. Status: ${r.status}`,
        "REPORT",
      );

      res.json(r);
    } catch {
      fail(res, 400, "Could not update report");
    }
  },
);

app.post("/api/reports/concerns/:id/comments", auth, async (req, res) => {
  try {
    const r = await prisma.report.findUnique({
      where: {
        id: num(req.params.id),
      },
    });

    if (!r) {
      return fail(res, 404, "Report not found");
    }

    if (req.user.role === Role.EMPLOYEE && r.reporterId !== req.user.id) {
      return fail(res, 403, "Own reports only");
    }

    if (!req.body.message) {
      return fail(res, 400, "Message required");
    }

    const u = await prisma.reportUpdate.create({
      data: {
        reportId: r.id,
        userId: req.user.id,
        message: String(req.body.message),
        isInternal: Boolean(
          req.body.isInternal && req.user.role !== Role.EMPLOYEE,
        ),
        status: r.status,
      },
    });

    await audit(req, "REPORT_COMMENTED", "REPORT", r.id, {
      internal: u.isInternal,
    });

    await notify(
      r.reporterId,
      "Report update",
      `A new update was added to ${r.reportCode}.`,
      "REPORT",
    );

    res.status(201).json(u);
  } catch {
    fail(res, 400, "Could not add report update");
  }
});

/* =========================================================
   NOTIFICATIONS / SETTINGS / SECURITY
========================================================= */

app.get("/api/notifications", auth, async (req, res) => {
  try {
    const rows = await prisma.notification.findMany({
      where: {
        userId: req.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    res.json(rows);
  } catch {
    fail(res, 500, "Could not load notifications");
  }
});

app.patch("/api/notifications/:id/read", auth, async (req, res) => {
  try {
    const row = await prisma.notification.updateMany({
      where: {
        id: num(req.params.id),
        userId: req.user.id,
      },
      data: {
        isRead: true,
      },
    });

    res.json({
      updated: row.count,
    });
  } catch {
    fail(res, 400, "Could not update notification");
  }
});

app.get("/api/security/history", auth, async (req, res) => {
  try {
    res.json(
      await prisma.securityEvent.findMany({
        where: {
          userId: req.user.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
      }),
    );
  } catch {
    fail(res, 500, "Could not load security history");
  }
});

app.get("/api/settings", auth, async (req, res) => {
  try {
    const p = await prisma.userPreference.findUnique({
      where: {
        userId: req.user.id,
      },
    });

    res.json(
      p || {
        theme: "system",
      },
    );
  } catch {
    fail(res, 500, "Could not load settings");
  }
});

app.patch("/api/settings", auth, async (req, res) => {
  try {
    const theme = String(req.body.theme || "");

    if (!validTheme(theme)) {
      return fail(res, 400, "Theme must be system, light or dark");
    }

    const p = await prisma.userPreference.upsert({
      where: {
        userId: req.user.id,
      },
      update: {
        theme,
      },
      create: {
        userId: req.user.id,
        theme,
      },
    });

    res.json(p);
  } catch {
    fail(res, 400, "Could not save settings");
  }
});

app.get("/api/settings/security", auth, async (req, res) => {
  res.json({
    passwordChange: true,
    passwordReset: true,
    securityHistory: true,
    accountStatus: req.user.isActive,
  });
});

/* =========================================================
   AUDIT
========================================================= */

app.get(
  "/api/audit/records",
  auth,
  allow(Role.ADMIN, Role.HR, Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const category = String(req.query.category || "");

      const q = String(req.query.q || "").trim();

      let where = {};

      if (category === "EMPLOYEE") {
        where = {
          entity: {
            in: [
              "EMPLOYEE",
              "ATTENDANCE",
              "LEAVE",
              "PERFORMANCE_GOAL",
              "PERFORMANCE_REVIEW",
            ],
          },
        };
      }

      if (category === "HR") {
        where = {
          entity: {
            in: ["EMPLOYEE", "LEAVE", "ATTENDANCE", "REPORT"],
          },
        };
      }

      if (category === "PAYROLL_MANAGER") {
        where = {
          entity: {
            in: [
              "SALARY",
              "PAYROLL",
              "PAYSLIP",
              "TAX_BRACKET",
              "STATUTORY_CONFIG",
              "STATUTORY_ENROLLMENT",
            ],
          },
        };
      }

      if (category === "ADMIN") {
        where = {
          entity: {
            in: [
              "USER",
              "ACCOUNT_LIMIT",
              "COMPANY",
              "PERMISSION",
              "SYSTEM",
              "SECURITY",
              "STATUTORY_CONFIG",
              "STATUTORY_ENROLLMENT",
            ],
          },
        };
      }

      if (q) {
        where.OR = [
          {
            action: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            entity: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            entityId: {
              contains: q,
              mode: "insensitive",
            },
          },
        ];
      }

      res.json(
        await prisma.auditLog.findMany({
          where,
          include: {
            user: {
              select: {
                email: true,
                role: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 500,
        }),
      );
    } catch {
      fail(res, 500, "Could not load records");
    }
  },
);

app.get("/api/audit", auth, async (req, res) => {
  try {
    let where = {};

    if (req.user.role === Role.HR) {
      where = {
        entity: {
          in: [
            "EMPLOYEE",
            "ATTENDANCE",
            "LEAVE",
            "LEAVE_TYPE",
            "SALARY",
            "PERFORMANCE_GOAL",
            "PERFORMANCE_REVIEW",
            "STATUTORY_ENROLLMENT",
          ],
        },
      };
    } else if (req.user.role === Role.PAYROLL_MANAGER) {
      where = {
        entity: {
          in: [
            "SALARY",
            "PAYROLL",
            "PAYSLIP",
            "TAX_BRACKET",
            "STATUTORY_CONFIG",
            "STATUTORY_ENROLLMENT",
          ],
        },
      };
    } else if (req.user.role !== Role.ADMIN) {
      return fail(res, 403, "You do not have permission for this action");
    }

    res.json(
      await prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 500,
      }),
    );
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not load audit logs");
  }
});

/* =========================================================
   APPROVALS
========================================================= */

app.get(
  "/api/approvals",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const where =
        req.user.role === Role.ADMIN
          ? {
              status: ApprovalStatus.PENDING,
            }
          : {
              status: ApprovalStatus.PENDING,
              type: ApprovalType.PAYROLL,
            };

      res.json(
        await prisma.approvalRequest.findMany({
          where,
          include: {
            requestedBy: {
              select: {
                email: true,
                role: true,
              },
            },
            reviewer: {
              select: {
                email: true,
                role: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
      );
    } catch {
      fail(res, 500, "Could not load approvals");
    }
  },
);

/* =========================================================
   COMPATIBILITY / COMPLETION ROUTES
========================================================= */

app.post(
  "/api/employees/:id/photo",
  auth,
  upload.single("photo"),
  async (req, res) => {
    try {
      const id = num(req.params.id);
      if (req.user.role === Role.EMPLOYEE && !isEmployee(req, id))
        return fail(res, 403, "Own profile only");
      if (!req.file) return fail(res, 400, "Valid image required");
      const old = await prisma.employee.findUnique({
        where: { id },
        select: { profilePhotoUrl: true },
      });
      if (old?.profilePhotoUrl?.startsWith("/uploads/"))
        fs.rm(path.join(root, old.profilePhotoUrl.slice(1)), () => {});
      const url = `/uploads/${req.file.filename}`;
      await prisma.employee.update({
        where: { id },
        data: { profilePhotoUrl: url },
      });
      await audit(req, "PHOTO_UPDATE", "EMPLOYEE", id, {});
      res.json({ profilePhotoUrl: url });
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not upload photo");
    }
  },
);

/*
 * ==========================================================
 * APPROVE ATTENDANCE REQUEST
 * ==========================================================
 * New preferred endpoint
 * POST /api/attendance/requests/:requestId/approve
 */
app.post(
  "/api/attendance/requests/:requestId/approve",
  auth,
  allow(Role.HR, Role.ADMIN),
  async (req, res) => {
    try {
      const requestId = num(req.params.requestId);

      const request = await prisma.attendanceRequest.findUnique({
        where: {
          id: requestId,
        },

        include: {
          attendance: true,
        },
      });

      if (!request) {
        return fail(res, 404, "Attendance request not found");
      }

      if (request.status !== AttendanceApprovalStatus.PENDING) {
        return fail(
          res,
          400,
          `Attendance request is already ${String(
            request.status,
          ).toLowerCase()}`,
        );
      }

      const attendance = request.attendance;

      /*
       * ----------------------------------------------------
       * CHECK-IN APPROVAL
       * ----------------------------------------------------
       */
      if (request.type === "CHECK_IN") {
        /*
         * Only the current/latest check-in request
         * may modify current attendance state.
         */
        const latest = await prisma.attendanceRequest.findFirst({
          where: {
            attendanceId: attendance.id,

            type: "CHECK_IN",
          },

          orderBy: {
            createdAt: "desc",
          },
        });

        if (!latest || latest.id !== request.id) {
          return fail(
            res,
            409,
            "This check-in request is no longer the current request",
          );
        }

        if (attendance.checkInStatus === AttendanceApprovalStatus.APPROVED) {
          return fail(res, 400, "Check-in is already approved");
        }

        const now = new Date();

        const updated = await prisma.$transaction(async (tx) => {
          await tx.attendanceRequest.update({
            where: {
              id: request.id,
            },

            data: {
              status: AttendanceApprovalStatus.APPROVED,

              reviewedById: req.user.id,

              reviewedAt: now,
            },
          });

          return tx.attendance.update({
            where: {
              id: attendance.id,
            },

            data: {
              checkInStatus: AttendanceApprovalStatus.APPROVED,

              checkInApprovedById: req.user.id,

              checkInApprovedAt: now,

              workedDurationMinutes: null,
            },

            include: attendanceInclude,
          });
        });

        await audit(req, "APPROVE_CHECK_IN", "ATTENDANCE", attendance.id, {
          employeeId: attendance.employeeId,

          requestId: request.id,
        });

        return res.json(updated);
      }

      /*
       * ----------------------------------------------------
       * CHECK-OUT APPROVAL
       * ----------------------------------------------------
       */
      if (request.type === "CHECK_OUT") {
        const latest = await prisma.attendanceRequest.findFirst({
          where: {
            attendanceId: attendance.id,

            type: "CHECK_OUT",
          },

          orderBy: {
            createdAt: "desc",
          },
        });

        if (!latest || latest.id !== request.id) {
          return fail(
            res,
            409,
            "This check-out request is no longer the current request",
          );
        }

        if (attendance.checkInStatus !== AttendanceApprovalStatus.APPROVED) {
          return fail(
            res,
            400,
            "Check-in must be approved before approving check-out",
          );
        }

        if (attendance.checkOutStatus === AttendanceApprovalStatus.APPROVED) {
          return fail(res, 400, "Check-out is already approved");
        }

        const now = new Date();

        const workedDurationMinutes = calculateWorkedDurationMinutes({
          ...attendance,

          checkOut: request.eventTime,

          checkOutStatus: AttendanceApprovalStatus.APPROVED,
        });

        const updated = await prisma.$transaction(async (tx) => {
          await tx.attendanceRequest.update({
            where: {
              id: request.id,
            },

            data: {
              status: AttendanceApprovalStatus.APPROVED,

              reviewedById: req.user.id,

              reviewedAt: now,
            },
          });

          return tx.attendance.update({
            where: {
              id: attendance.id,
            },

            data: {
              checkOutStatus: AttendanceApprovalStatus.APPROVED,

              checkOutApprovedById: req.user.id,

              checkOutApprovedAt: now,

              workedDurationMinutes,
            },

            include: attendanceInclude,
          });
        });

        await audit(req, "APPROVE_CHECK_OUT", "ATTENDANCE", attendance.id, {
          employeeId: attendance.employeeId,

          requestId: request.id,

          workedDurationMinutes,
        });

        return res.json(updated);
      }

      return fail(res, 400, "Unsupported attendance request type");
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not approve attendance request");
    }
  },
);
/*
 * ==========================================================
 * REJECT ATTENDANCE REQUEST
 * ==========================================================
 *
 * Rejection reason is REQUIRED.
 *
 * POST /api/attendance/requests/:requestId/reject
 * Body:
 * * {
 *   "rejectedReason": "Wrong check-in time"
 * }
 */
app.post(
  "/api/attendance/requests/:requestId/reject",
  auth,
  allow(Role.HR, Role.ADMIN),
  async (req, res) => {
    try {
      const requestId = num(req.params.requestId);

      const rejectedReason = req.body?.rejectedReason
        ? String(req.body.rejectedReason).trim()
        : "";

      if (!rejectedReason) {
        return fail(res, 400, "Rejection reason is required");
      }

      const request = await prisma.attendanceRequest.findUnique({
        where: {
          id: requestId,
        },

        include: {
          attendance: true,
        },
      });

      if (!request) {
        return fail(res, 404, "Attendance request not found");
      }

      if (request.status !== AttendanceApprovalStatus.PENDING) {
        return fail(
          res,
          400,
          `Attendance request is already ${String(
            request.status,
          ).toLowerCase()}`,
        );
      }

      /*
       * Make sure this is still the latest request
       * of this type.
       */
      const latest = await prisma.attendanceRequest.findFirst({
        where: {
          attendanceId: request.attendanceId,

          type: request.type,
        },

        orderBy: {
          createdAt: "desc",
        },
      });

      if (!latest || latest.id !== request.id) {
        return fail(
          res,
          409,
          "This attendance request is no longer the current request",
        );
      }

      const now = new Date();

      const updated = await prisma.$transaction(async (tx) => {
        await tx.attendanceRequest.update({
          where: {
            id: request.id,
          },

          data: {
            status: AttendanceApprovalStatus.REJECTED,

            reviewedById: req.user.id,

            reviewedAt: now,

            rejectedReason,
          },
        });

        const attendanceData =
          request.type === "CHECK_IN"
            ? {
                checkInStatus: AttendanceApprovalStatus.REJECTED,

                /*
                 * The timestamp remains visible.
                 */
                checkInApprovedById: null,

                checkInApprovedAt: null,

                workedDurationMinutes: null,
              }
            : {
                checkOutStatus: AttendanceApprovalStatus.REJECTED,

                /*
                 * The timestamp remains visible.
                 */
                checkOutApprovedById: null,

                checkOutApprovedAt: null,

                workedDurationMinutes: null,
              };

        return tx.attendance.update({
          where: {
            id: request.attendanceId,
          },

          data: attendanceData,

          include: attendanceInclude,
        });
      });

      await audit(
        req,
        request.type === "CHECK_IN" ? "REJECT_CHECK_IN" : "REJECT_CHECK_OUT",
        "ATTENDANCE",
        request.attendanceId,
        {
          employeeId: request.attendance.employeeId,

          requestId: request.id,

          rejectedReason,
        },
      );

      return res.json(updated);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not reject attendance request");
    }
  },
);
/*
 * ==========================================================
 * APPLY AGAIN
 * ==========================================================
 * * Employee / Payroll Manager only.
 * * This creates a NEW AttendanceRequest.
 * * The old rejected request remains in history.
 * * Body:
 * * {
 *   "requestId": 123
 * }
 */
app.post(
  "/api/attendance/requests/:requestId/apply-again",
  auth,
  allow(Role.EMPLOYEE, Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      if (!req.user.employeeId) {
        return fail(res, 400, "Employee account is not linked");
      }

      const requestId = num(req.params.requestId);

      const previous = await prisma.attendanceRequest.findUnique({
        where: {
          id: requestId,
        },

        include: {
          attendance: true,
        },
      });

      if (!previous) {
        return fail(res, 404, "Attendance request not found");
      }

      if (previous.attendance.employeeId !== req.user.employeeId) {
        return fail(res, 403, "You can only re-apply for your own attendance");
      }

      if (previous.status !== AttendanceApprovalStatus.REJECTED) {
        return fail(
          res,
          400,
          "Only a rejected attendance request can be submitted again",
        );
      }

      /*
       * Only the latest rejected request can be
       * re-applied.
       */
      const latest = await prisma.attendanceRequest.findFirst({
        where: {
          attendanceId: previous.attendanceId,

          type: previous.type,
        },

        orderBy: {
          createdAt: "desc",
        },
      });

      if (!latest || latest.id !== previous.id) {
        return fail(res, 409, "This is not the latest attendance request");
      }

      /*
       * Do not allow another pending request.
       */
      const pending = await prisma.attendanceRequest.findFirst({
        where: {
          attendanceId: previous.attendanceId,

          type: previous.type,

          status: AttendanceApprovalStatus.PENDING,
        },
      });

      if (pending) {
        return fail(res, 400, "An attendance request is already pending");
      }

      const eventTime = new Date();

      const attendanceData =
        previous.type === "CHECK_IN"
          ? {
              checkIn: eventTime,

              checkInRecordedById: req.user.id,

              checkInStatus: AttendanceApprovalStatus.PENDING,

              checkInApprovedById: null,

              checkInApprovedAt: null,

              workedDurationMinutes: null,
            }
          : {
              checkOut: eventTime,

              checkOutRecordedById: req.user.id,

              checkOutStatus: AttendanceApprovalStatus.PENDING,

              checkOutApprovedById: null,

              checkOutApprovedAt: null,

              workedDurationMinutes: null,
            };

      const result = await prisma.$transaction(async (tx) => {
        const attendance = await tx.attendance.update({
          where: {
            id: previous.attendanceId,
          },

          data: attendanceData,
        });

        const request = await tx.attendanceRequest.create({
          data: {
            attendanceId: attendance.id,

            type: previous.type,

            eventTime,

            status: AttendanceApprovalStatus.PENDING,

            recordedById: req.user.id,
          },
        });

        return {
          attendance,
          request,
        };
      });

      await audit(req, "APPLY_AGAIN", "ATTENDANCE", result.attendance.id, {
        employeeId: result.attendance.employeeId,

        previousRequestId: previous.id,

        requestId: result.request.id,

        type: result.request.type,
      });

      const attendance = await prisma.attendance.findUnique({
        where: {
          id: result.attendance.id,
        },

        include: attendanceInclude,
      });

      return res.json(attendance);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not apply again");
    }
  },
);
/*
 * ==========================================================
 * ATTENDANCE REQUEST HISTORY
 * ==========================================================
 * * Employee / Payroll Manager:
 *   own requests only
 * * HR / Admin:
 *   all requests
 * * Optional:
 *   ?status=PENDING
 *   ?type=CHECK_IN
 */
app.get("/api/attendance/requests", auth, async (req, res) => {
  try {
    const where = {};

    if (
      req.user.role === Role.EMPLOYEE ||
      req.user.role === Role.PAYROLL_MANAGER
    ) {
      if (!req.user.employeeId) {
        return fail(res, 400, "Employee account is not linked");
      }

      where.attendance = {
        employeeId: req.user.employeeId,
      };
    } else if (req.user.role !== Role.HR && req.user.role !== Role.ADMIN) {
      return fail(res, 403, "You cannot view attendance requests");
    }

    if (req.query.status) {
      where.status = String(req.query.status).toUpperCase();
    }

    if (req.query.type) {
      where.type = String(req.query.type).toUpperCase();
    }

    const requests = await prisma.attendanceRequest.findMany({
      where,

      include: {
        attendance: {
          include: {
            employee: true,
          },
        },

        recordedBy: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },

        reviewedBy: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },

      take: 500,
    });

    return res.json(requests);
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not load attendance request history");
  }
});

app.post(
  "/api/leaves/:id/propose",
  auth,
  allow(Role.HR, Role.ADMIN),
  async (req, res) => {
    try {
      const id = num(req.params.id);

      const result = await prisma.$transaction(async (tx) => {
        const row = await tx.leaveRequest.findUnique({
          where: { id },

          include: {
            employee: {
              include: {
                user: true,
              },
            },

            leaveType: true,
          },
        });

        if (!row) {
          throw new Error("Leave not found");
        }

        if (row.status !== "PENDING") {
          throw new Error("Only pending leave requests can be changed");
        }

        if (
          row.employee.user?.role === Role.HR &&
          req.user.role !== Role.ADMIN
        ) {
          throw new Error("HR leave requests must be reviewed by Admin");
        }

        if (row.employee.user?.id === req.user.id) {
          throw new Error("You cannot review your own leave");
        }

        const proposedLeaveTypeId =
          req.body.leaveTypeId !== undefined
            ? num(req.body.leaveTypeId)
            : row.leaveTypeId;

        const proposedLeaveType = await tx.leaveType.findUnique({
          where: {
            id: proposedLeaveTypeId,
          },
        });

        if (!proposedLeaveType || !proposedLeaveType.isActive) {
          throw new Error("Invalid or inactive leave type");
        }

        const proposedStart = req.body.startDate
          ? dateOnly(req.body.startDate)
          : row.startDate;

        const proposedEnd = req.body.endDate
          ? dateOnly(req.body.endDate)
          : row.endDate;

        if (proposedEnd < proposedStart) {
          throw new Error("End date cannot be before start date");
        }

        const calculatedDays = daysBetween(proposedStart, proposedEnd);

        const proposedDays =
          req.body.days !== undefined ? Number(req.body.days) : calculatedDays;

        if (!Number.isFinite(proposedDays)) {
          throw new Error("Invalid leave days");
        }

        if (proposedDays < 1) {
          throw new Error("Leave days must be at least 1");
        }

        if (proposedDays !== calculatedDays) {
          throw new Error("Leave days must match the selected date range");
        }

        let proposedPayment;

        if (proposedLeaveType.paymentPolicy === "HR_DECIDES") {
          proposedPayment = req.body.payment;

          if (!["PAID", "UNPAID"].includes(proposedPayment)) {
            throw new Error("HR/Admin must select the proposed payment");
          }
        } else {
          proposedPayment =
            req.body.payment !== undefined ? req.body.payment : row.payment;
        }

        if (!["PAID", "UNPAID"].includes(proposedPayment)) {
          throw new Error("Invalid payment");
        }

        if (
          proposedLeaveType.paymentPolicy === "PAID_ONLY" &&
          proposedPayment !== "PAID"
        ) {
          throw new Error("This leave type only allows paid leave");
        }

        if (
          proposedLeaveType.paymentPolicy === "UNPAID_ONLY" &&
          proposedPayment !== "UNPAID"
        ) {
          throw new Error("This leave type only allows unpaid leave");
        }

        const proposedReason =
          req.body.reason !== undefined
            ? req.body.reason?.trim() || null
            : row.reason;

        if (proposedLeaveType.requiresReason && !proposedReason) {
          throw new Error("A reason is required for this leave type");
        }

        const adjustmentNote = req.body.adjustmentNote?.trim() || null;

        if (!adjustmentNote) {
          throw new Error("Adjustment note is required when proposing changes");
        }

        const revision = await tx.leaveRequestRevision.create({
          data: {
            leaveRequestId: row.id,
            action: "PROPOSED",
            leaveTypeId: proposedLeaveTypeId,
            startDate: proposedStart,
            endDate: proposedEnd,
            days: proposedDays,
            payment: proposedPayment,
            reason: proposedReason,
            adjustmentNote,
            proposedById: req.user.id,
          },
        });

        await tx.leaveRequest.update({
          where: {
            id: row.id,
          },

          data: {
            status: "PROPOSED",
          },
        });

        return revision;
      });

      await audit(req, "PROPOSE", "LEAVE", id, {
        revisionId: result.id,
      });

      const owner = await prisma.leaveRequest.findUnique({
        where: { id },

        select: {
          employee: {
            select: {
              user: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      if (owner?.employee?.user?.id) {
        await notify(
          owner.employee.user.id,
          "Leave changes proposed",
          "HR/Admin has proposed changes to your leave request. Please review them.",
          "LEAVE",
        );
      }

      res.json(result);
    } catch (e) {
      console.error(e);

      fail(res, 400, e.message || "Could not propose leave changes");
    }
  },
);
app.post("/api/leaves/:id/proposal/accept", auth, async (req, res) => {
  try {
    const id = num(req.params.id);

    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.leaveRequest.findUnique({
        where: { id },

        include: {
          employee: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!row) {
        throw new Error("Leave not found");
      }

      if (row.status !== "PROPOSED") {
        throw new Error("This leave does not have a pending proposal");
      }

      if (row.employee.user?.id !== req.user.id) {
        throw new Error("Only the leave owner can accept the proposal");
      }

      const proposal = await tx.leaveRequestRevision.findFirst({
        where: {
          leaveRequestId: id,
          action: "PROPOSED",
        },

        orderBy: {
          createdAt: "desc",
        },
      });

      if (!proposal) {
        throw new Error("Leave proposal not found");
      }

      await tx.leaveRequestRevision.update({
        where: {
          id: proposal.id,
        },

        data: {
          action: "ACCEPTED",
          respondedById: req.user.id,
          respondedAt: new Date(),
        },
      });

      const updated = await tx.leaveRequest.update({
        where: { id },

        data: {
          leaveTypeId: proposal.leaveTypeId,
          startDate: proposal.startDate,
          endDate: proposal.endDate,
          days: proposal.days,
          payment: proposal.payment,
          reason: proposal.reason,
          status: "APPROVED",
          reviewedById: proposal.proposedById,
          reviewedAt: new Date(),
        },
      });

      if (proposal.payment === "PAID") {
        const year = proposal.startDate.getFullYear();

        await tx.leaveBalance.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: row.employeeId,
              leaveTypeId: proposal.leaveTypeId,
              year,
            },
          },

          update: {
            used: {
              increment: proposal.days,
            },
          },

          create: {
            employeeId: row.employeeId,
            leaveTypeId: proposal.leaveTypeId,
            year,
            used: proposal.days,
          },
        });
      }

      return updated;
    });

    await audit(req, "ACCEPT_PROPOSAL", "LEAVE", id, {});

    res.json(result);
  } catch (e) {
    console.error(e);

    fail(res, 400, e.message || "Could not accept leave proposal");
  }
});
app.post("/api/leaves/:id/proposal/decline", auth, async (req, res) => {
  try {
    const id = num(req.params.id);

    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.leaveRequest.findUnique({
        where: { id },

        include: {
          employee: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!row) {
        throw new Error("Leave not found");
      }

      if (row.status !== "PROPOSED") {
        throw new Error("This leave does not have a pending proposal");
      }

      if (row.employee.user?.id !== req.user.id) {
        throw new Error("Only the leave owner can decline the proposal");
      }

      const proposal = await tx.leaveRequestRevision.findFirst({
        where: {
          leaveRequestId: id,
          action: "PROPOSED",
        },

        orderBy: {
          createdAt: "desc",
        },
      });

      if (!proposal) {
        throw new Error("Leave proposal not found");
      }

      await tx.leaveRequestRevision.update({
        where: {
          id: proposal.id,
        },

        data: {
          action: "DECLINED",
          respondedById: req.user.id,
          respondedAt: new Date(),
        },
      });

      return tx.leaveRequest.update({
        where: { id },

        data: {
          status: "PENDING",
        },
      });
    });

    await audit(req, "DECLINE_PROPOSAL", "LEAVE", id, {});

    /*
     * Notify the proposer rather than
     * notifying the employee who declined it.
     */
    const proposal = await prisma.leaveRequestRevision.findFirst({
      where: {
        leaveRequestId: id,
        action: "DECLINED",
      },

      orderBy: {
        respondedAt: "desc",
      },

      select: {
        proposedById: true,
      },
    });

    if (proposal?.proposedById) {
      await notify(
        proposal.proposedById,
        "Leave proposal declined",
        "The employee declined the proposed changes. The leave request has returned to review.",
        "LEAVE",
      );
    }

    res.json(result);
  } catch (e) {
    console.error(e);

    fail(res, 400, e.message || "Could not decline leave proposal");
  }
});
app.post(
  "/api/leaves/:id/reject",
  auth,
  allow(Role.HR, Role.ADMIN),
  async (req, res) => {
    try {
      const id = num(req.params.id);

      const rejectionReason = req.body.rejectionReason?.trim();

      if (!rejectionReason) {
        return fail(res, 400, "Rejection reason is required");
      }

      const result = await prisma.$transaction(async (tx) => {
        const row = await tx.leaveRequest.findUnique({
          where: { id },

          include: {
            employee: {
              include: {
                user: true,
              },
            },
          },
        });

        if (!row) {
          throw new Error("Leave not found");
        }

        /*
         * A PROPOSED request must be answered
         * by the employee. HR/Admin cannot
         * bypass that handshake by rejecting it.
         */
        if (row.status !== "PENDING") {
          throw new Error("Only pending leave requests can be rejected");
        }

        if (
          row.employee.user?.role === Role.HR &&
          req.user.role !== Role.ADMIN
        ) {
          throw new Error("HR leave requests must be rejected by Admin");
        }

        if (row.employee.user?.id === req.user.id) {
          throw new Error("You cannot reject your own leave");
        }

        return tx.leaveRequest.update({
          where: { id },

          data: {
            status: "REJECTED",
            rejectionReason,
            reviewedById: req.user.id,
            reviewedAt: new Date(),
          },
        });
      });

      await audit(req, "REJECT", "LEAVE", id, {
        rejectionReason,
      });

      const owner = await prisma.employee.findUnique({
        where: {
          id: result.employeeId,
        },

        select: {
          user: {
            select: {
              id: true,
            },
          },
        },
      });

      if (owner?.user?.id) {
        await notify(
          owner.user.id,
          "Leave rejected",
          `Your leave request was rejected. Reason: ${rejectionReason}`,
          "LEAVE",
        );
      }

      res.json(result);
    } catch (e) {
      console.error(e);

      fail(res, 400, e.message || "Could not reject leave");
    }
  },
);
app.get("/api/leave-balances/me", auth, async (req, res) => {
  try {
    const u = await prisma.user.findUnique({
      where: {
        id: req.user.id,
      },

      select: {
        employeeId: true,
      },
    });

    if (!u?.employeeId) {
      return res.json([]);
    }

    res.json(
      await prisma.leaveBalance.findMany({
        where: {
          employeeId: u.employeeId,
          year: new Date().getFullYear(),
        },

        include: {
          leaveType: true,
        },

        orderBy: {
          leaveTypeId: "asc",
        },
      }),
    );
  } catch (e) {
    console.error(e);

    fail(res, 500, "Could not load balances");
  }
});

app.get("/api/holidays", auth, async (req, res) =>
  res.json(
    await prisma.holiday.findMany({
      where: req.query.year
        ? {
            holidayDate: {
              gte: new Date(num(req.query.year), 0, 1),
              lt: new Date(num(req.query.year) + 1, 0, 1),
            },
          }
        : {},
      orderBy: { holidayDate: "asc" },
    }),
  ),
);
app.post(
  "/api/holidays",
  auth,
  allow(Role.HR, Role.ADMIN),
  async (req, res) => {
    try {
      const x = await prisma.holiday.create({
        data: {
          name: req.body.name,
          holidayDate: dateOnly(req.body.holidayDate),
          type: req.body.type || "PUBLIC",
          isPaid: req.body.isPaid !== false,
          description: req.body.description || null,
        },
      });
      await audit(req, "CREATE", "HOLIDAY", x.id, { name: x.name });
      res.status(201).json(x);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not create holiday");
    }
  },
);
app.patch(
  "/api/holidays/:id",
  auth,
  allow(Role.HR, Role.ADMIN),
  async (req, res) => {
    try {
      const data = {};
      if (req.body.name !== undefined) data.name = req.body.name;
      if (req.body.holidayDate !== undefined)
        data.holidayDate = dateOnly(req.body.holidayDate);
      if (req.body.type !== undefined) data.type = req.body.type;
      if (req.body.isPaid !== undefined) data.isPaid = Boolean(req.body.isPaid);
      if (req.body.description !== undefined)
        data.description = req.body.description || null;
      const x = await prisma.holiday.update({
        where: { id: num(req.params.id) },
        data,
      });
      await audit(req, "UPDATE", "HOLIDAY", x.id, {
        fields: Object.keys(data),
      });
      res.json(x);
    } catch (e) {
      fail(res, 400, "Could not update holiday");
    }
  },
);
app.delete("/api/holidays/:id", auth, allow(Role.ADMIN), async (req, res) => {
  try {
    await prisma.holiday.delete({ where: { id: num(req.params.id) } });
    await audit(req, "DELETE", "HOLIDAY", num(req.params.id), {});
    res.status(204).end();
  } catch (e) {
    fail(res, 400, "Could not delete holiday");
  }
});

app.get("/api/salary", auth, async (req, res) => {
  try {
    const where =
      req.user.role === Role.EMPLOYEE
        ? { employee: { user: { id: req.user.id } } }
        : {};
    res.json(
      await prisma.salaryStructure.findMany({
        where,
        include: { employee: true },
        orderBy: { employeeId: "asc" },
        take: 500,
      }),
    );
  } catch (e) {
    fail(res, 500, "Could not load salary");
  }
});
app.put(
  "/api/salary/:employeeId",
  auth,
  allow(Role.PAYROLL_MANAGER, Role.HR),
  async (req, res) => {
    try {
      const employeeId = num(req.params.employeeId),
        old = await prisma.salaryStructure.findUnique({
          where: { employeeId },
        });
      if (!old) return fail(res, 404, "Salary not found");
      const data = {
        basicSalary: num(req.body.basicSalary),
        housingAllowance: num(req.body.housingAllowance),
        transportAllowance: num(req.body.transportAllowance),
        otherAllowance: num(req.body.otherAllowance),
        overtimeRate: num(req.body.overtimeRate),
        employeeSSF: num(req.body.employeeSSF),
        employerSSF: num(req.body.employerSSF),
        employeePF: num(req.body.employeePF),
        employerPF: num(req.body.employerPF),
        effectiveFrom: req.body.effectiveFrom
          ? new Date(req.body.effectiveFrom)
          : old.effectiveFrom,
      };
      const x = await prisma.$transaction(async (tx) => {
        const s = await tx.salaryStructure.update({
          where: { employeeId },
          data,
        });
        if (Number(old.basicSalary) !== Number(data.basicSalary))
          await tx.salaryChange.create({
            data: {
              employeeId,
              previousBasic: old.basicSalary,
              newBasic: data.basicSalary,
              reason: req.body.reason || "Salary update",
              effectiveFrom: data.effectiveFrom,
              changedById: req.user.id,
            },
          });
        return s;
      });
      await audit(req, "UPDATE", "SALARY", employeeId, {
        previousBasic: String(old.basicSalary),
        newBasic: String(data.basicSalary),
      });
      res.json(x);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not update salary");
    }
  },
);

app.get("/api/payroll", auth, async (req, res) => {
  try {
    const where =
      req.user.role === Role.EMPLOYEE
        ? { employee: { user: { id: req.user.id } } }
        : {};
    res.json(
      await prisma.payrollPeriod.findMany({
        orderBy: [{ year: "desc" }, { month: "desc" }],
        include: {
          _count: { select: { records: true } },
          records: {
            where,
            include: { employee: true, payslip: true, period: true },
            orderBy: { employeeId: "asc" },
            take: 1000,
          },
        },
      }),
    );
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not load payroll");
  }
});
app.post(
  "/api/payroll/process",
  auth,
  allow(Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const year = num(req.body.year),
        month = num(req.body.month);
      if (!year || month < 1 || month > 12)
        return fail(res, 400, "Valid year and month are required");
      const existing = await prisma.payrollPeriod.findUnique({
        where: { year_month: { year, month } },
      });
      if (
        existing &&
        ["HR_APPROVED", "ADMIN_APPROVED", "PAID", "LOCKED"].includes(
          existing.status,
        )
      )
        return fail(
          res,
          400,
          "This payroll period is already approved or locked",
        );
      const period = await prisma.payrollPeriod.upsert({
        where: { year_month: { year, month } },
        update: {
          status: PayrollStatus.PROCESSING,
          hrApprovedById: null,
          hrApprovedAt: null,
          adminApprovedById: null,
          adminApprovedAt: null,
          paidAt: null,
          lockedAt: null,
        },
        create: { year, month, status: PayrollStatus.PROCESSING },
      });
      const taxBrackets = await prisma.taxBracket.findMany({
        where: {
          isActive: true,
          effectiveFrom: { lte: new Date(year, month - 1, 1) },
        },
        orderBy: { effectiveFrom: "desc" },
      });
      const latestByLower = new Map();
      for (const b of taxBrackets) {
        const key = String(b.lowerBound);
        if (!latestByLower.has(key)) latestByLower.set(key, b);
      }
      const brackets = [...latestByLower.values()];
      const start = new Date(year, month - 1, 1),
        end = new Date(year, month, 1);
      const [holidays, employees] = await Promise.all([
        prisma.holiday.findMany({
          where: { holidayDate: { gte: start, lt: end }, isPaid: false },
          select: { holidayDate: true },
        }),
        prisma.employee.findMany({
          where: { status: "ACTIVE" },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            salary: true,
            attendance: {
              where: { workDate: { gte: start, lt: end } },
              select: { overtimeHours: true, status: true, workDate: true },
            },
            leaves: {
              where: {
                status: LeaveStatus.APPROVED,
                startDate: { lt: end },
                endDate: { gte: start },
              },
              include: { leaveType: true },
            },
          },
        }),
      ]);
      const holidaySet = new Set(
        holidays.map((h) => dateOnly(h.holidayDate).getTime()),
      );
      let workingDays = 0;
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        if (
          d.getDay() !== 0 &&
          d.getDay() !== 6 &&
          !holidaySet.has(dateOnly(d).getTime())
        )
          workingDays++;
      }
      await prisma.$transaction(async (tx) => {
        await tx.payrollRecord.deleteMany({ where: { periodId: period.id } });
        for (const e of employees) {
          if (!e.salary) continue;
          const unpaidLeaveDays = e.leaves
            .filter((l) => l.leaveType.payment === LeavePayment.UNPAID)
            .reduce((sum, l) => sum + Number(l.days), 0);
          const calc = calculatePayroll({
            salary: e.salary,
            attendance: e.attendance,
            taxBrackets: brackets,
            unpaidLeaveDays,
            workingDays,
          });
          await tx.payrollRecord.create({
            data: {
              periodId: period.id,
              employeeId: e.id,
              basic: calc.basic,
              allowances: calc.allowances,
              overtime: calc.overtime,
              unpaidLeaveDeduction: calc.unpaidLeaveDeduction,
              gross: calc.gross,
              employeeSSF: calc.employeeSSF,
              employeePF: calc.employeePF,
              tax: calc.tax,
              otherDeductions: calc.otherDeductions,
              adjustment: calc.adjustment,
              net: calc.net,
              employerSSF: calc.employerSSF,
              employerPF: calc.employerPF,
              payslip: { create: {} },
            },
          });
        }
      });
      const out = await prisma.payrollPeriod.update({
        where: { id: period.id },
        data: { status: PayrollStatus.PROCESSED },
        include: { _count: { select: { records: true } } },
      });
      await audit(req, "GENERATE", "PAYROLL", period.id, {
        year,
        month,
        employees: employees.length,
        taxConfiguration: brackets.map((x) => x.label),
      });
      res.json(out);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Payroll processing failed");
    }
  },
);

app.post(
  "/api/payroll/:id/hr-approve",
  auth,
  allow(Role.HR),
  async (req, res) => {
    try {
      const p = await prisma.payrollPeriod.findUnique({
        where: { id: num(req.params.id) },
      });
      if (!p || p.status !== PayrollStatus.PROCESSED)
        return fail(res, 400, "Payroll is not ready for HR approval");
      const x = await prisma.payrollPeriod.update({
        where: { id: p.id },
        data: {
          status: PayrollStatus.HR_APPROVED,
          hrApprovedById: req.user.id,
          hrApprovedAt: new Date(),
        },
      });
      await audit(req, "PAYROLL_APPROVED", "PAYROLL", p.id, { stage: "HR" });
      res.json(x);
    } catch (e) {
      fail(res, 400, "HR approval failed");
    }
  },
);
app.post(
  "/api/payroll/:id/admin-approve",
  auth,
  allow(Role.ADMIN),
  async (req, res) => {
    try {
      const p = await prisma.payrollPeriod.findUnique({
        where: { id: num(req.params.id) },
      });
      if (!p || p.status !== PayrollStatus.HR_APPROVED)
        return fail(res, 400, "Payroll requires HR approval first");
      const x = await prisma.payrollPeriod.update({
        where: { id: p.id },
        data: {
          status: PayrollStatus.ADMIN_APPROVED,
          adminApprovedById: req.user.id,
          adminApprovedAt: new Date(),
        },
      });
      await audit(req, "PAYROLL_APPROVED", "PAYROLL", p.id, { stage: "ADMIN" });
      res.json(x);
    } catch (e) {
      fail(res, 400, "Admin approval failed");
    }
  },
);
app.post(
  "/api/payroll/:id/pay",
  auth,
  allow(Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const p = await prisma.payrollPeriod.findUnique({
        where: { id: num(req.params.id) },
      });
      if (!p || p.status !== PayrollStatus.ADMIN_APPROVED)
        return fail(res, 400, "Payroll requires HR and Admin approval");
      const x = await prisma.payrollPeriod.update({
        where: { id: p.id },
        data: { status: PayrollStatus.PAID, paidAt: new Date() },
      });
      await audit(req, "MARK_PAID", "PAYROLL", p.id, {});
      res.json(x);
    } catch (e) {
      fail(res, 400, "Could not mark payroll paid");
    }
  },
);
app.post(
  "/api/payroll/:id/lock",
  auth,
  allow(Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const p = await prisma.payrollPeriod.findUnique({
        where: { id: num(req.params.id) },
      });
      if (!p || p.status !== PayrollStatus.PAID)
        return fail(res, 400, "Only paid payroll can be locked");
      const x = await prisma.payrollPeriod.update({
        where: { id: p.id },
        data: { status: PayrollStatus.LOCKED, lockedAt: new Date() },
      });
      await audit(req, "LOCK", "PAYROLL", p.id, {});
      res.json(x);
    } catch (e) {
      fail(res, 400, "Could not lock payroll");
    }
  },
);
app.get("/api/payslips/:id", auth, async (req, res) => {
  try {
    const p = await prisma.payslip.findUnique({
      where: { id: num(req.params.id) },
      include: {
        payrollRecord: {
          include: {
            employee: {
              include: { department: true, designation: true, branch: true },
            },
            period: true,
          },
        },
      },
    });
    if (!p) return fail(res, 404, "Payslip not found");
    if (
      req.user.role === Role.EMPLOYEE &&
      !isEmployee(req, p.payrollRecord.employeeId)
    )
      return fail(res, 403, "Own payslip only");
    res.json(p);
  } catch (e) {
    fail(res, 500, "Could not load payslip");
  }
});
app.get("/api/payslips/:id/pdf", auth, async (req, res) => {
  try {
    const p = await prisma.payslip.findUnique({
      where: { id: num(req.params.id) },
      include: {
        payrollRecord: {
          include: {
            employee: {
              include: { department: true, designation: true, branch: true },
            },
            period: true,
          },
        },
      },
    });
    if (!p) return fail(res, 404, "Payslip not found");
    const r = p.payrollRecord;
    if (req.user.role === Role.EMPLOYEE && !isEmployee(req, r.employeeId))
      return fail(res, 403, "Own payslip only");

    const pageW = 595.28;
    const pageH = 841.89;
    const navy = "#0f172a";
    const brand = "#2563eb";
    const muted = "#64748b";
    const line = "#e2e8f0";
    const emp = r.employee;
    const period = r.period;
    const monthName = new Date(
      period.year,
      period.month - 1,
      1,
    ).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const ref = `PP-${period.year}${String(period.month).padStart(2, "0")}-${r.id}`;
    const money = (v) =>
      Number(v || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const doc = new PDFDocument({ size: "A4", margin: 0 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="payslip-${emp.employeeCode}-${period.year}-${String(period.month).padStart(2, "0")}.pdf"`,
    );
    doc.pipe(res);

    doc.rect(0, 0, pageW, 92).fill(navy);
    doc.rect(pageW - 8, 0, 8, 92).fill(brand);
    doc
      .fillColor("#ffffff")
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("PAYROLLPRO", 40, 22);
    doc.fontSize(18).text("Employee Payslip", 40, 40);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#cbd5e1")
      .text(monthName, 40, 64);
    doc
      .fillColor("#94a3b8")
      .text(ref, 40, 64, { width: pageW - 80, align: "right" });

    let y = 112;
    doc
      .roundedRect(32, y, pageW - 64, 88, 6)
      .lineWidth(0.6)
      .strokeColor(line)
      .stroke();
    const meta = [
      ["Employee", `${emp.firstName} ${emp.lastName}`],
      ["Employee ID", emp.employeeCode],
      ["Department", emp.department?.name || "—"],
      ["Designation", emp.designation?.title || "—"],
      ["Branch", emp.branch?.name || "—"],
      ["Period", monthName],
    ];
    meta.forEach((row, i) => {
      const col = i % 2;
      const rowi = Math.floor(i / 2);
      const x = 48 + col * 250;
      const yy = y + 14 + rowi * 24;
      doc
        .fillColor(muted)
        .fontSize(7)
        .font("Helvetica-Bold")
        .text(row[0].toUpperCase(), x, yy);
      doc
        .fillColor(navy)
        .fontSize(10)
        .font("Helvetica")
        .text(String(row[1]), x, yy + 10);
    });

    y = 220;
    const colW = (pageW - 64 - 16) / 2;
    const earnings = [
      ["Basic salary", r.basic],
      ["Allowances", r.allowances],
      ["Overtime", r.overtime],
    ];
    const deductions = [
      ["Unpaid leave", r.unpaidLeaveDeduction],
      ["Employee SSF", r.employeeSSF],
      ["Employee PF", r.employeePF],
      ["Tax", r.tax],
      ["Other deductions", r.otherDeductions],
    ];
    const drawCol = (x, title, rows) => {
      doc
        .fillColor(navy)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(title.toUpperCase(), x, y);
      let yy = y + 18;
      doc
        .moveTo(x, yy)
        .lineTo(x + colW, yy)
        .strokeColor(line)
        .stroke();
      yy += 8;
      rows.forEach(([label, value]) => {
        doc
          .fillColor("#334155")
          .font("Helvetica")
          .fontSize(10)
          .text(label, x, yy, { width: colW - 80 });
        doc.text(money(value), x, yy, { width: colW, align: "right" });
        yy += 18;
      });
      const total = rows.reduce((s, [, v]) => s + Number(v || 0), 0);
      yy += 6;
      doc
        .moveTo(x, yy)
        .lineTo(x + colW, yy)
        .strokeColor(line)
        .stroke();
      yy += 8;
      doc.font("Helvetica-Bold").fillColor(navy).text("Total", x, yy);
      doc.text(money(total), x, yy, { width: colW, align: "right" });
    };
    drawCol(32, "Earnings", earnings);
    drawCol(32 + colW + 16, "Deductions", deductions);

    y = 430;
    doc.roundedRect(32, y, pageW - 64, 56, 6).fill(navy);
    doc
      .fillColor("#94a3b8")
      .font("Helvetica")
      .fontSize(8)
      .text("NET PAY", 48, y + 14);
    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(20)
      .text(money(r.net), 32, y + 18, { width: pageW - 80, align: "right" });
    doc
      .fillColor("#94a3b8")
      .font("Helvetica")
      .fontSize(8)
      .text(`Gross  ${money(r.gross)}`, 48, y + 34);

    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(8)
      .text(
        "This is a computer-generated payslip. Statutory calculations use the configuration stored in PayrollPro.",
        40,
        pageH - 48,
        { width: pageW - 80, align: "center" },
      );

    doc.end();
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not generate payslip PDF");
  }
});

app.get(
  "/api/tax-brackets",
  auth,
  allow(Role.ADMIN, Role.HR, Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      res.json(
        await prisma.taxBracket.findMany({
          orderBy: [{ effectiveFrom: "desc" }, { lowerBound: "asc" }],
        }),
      );
    } catch (e) {
      fail(res, 500, "Could not load tax configuration");
    }
  },
);
app.post("/api/tax-brackets", auth, allow(Role.ADMIN), async (req, res) => {
  try {
    const {
      label,
      lowerBound,
      upperBound,
      rate,
      fixedTax = 0,
      effectiveFrom,
      isActive = true,
    } = req.body;
    if (
      !label ||
      lowerBound === undefined ||
      rate === undefined ||
      !effectiveFrom
    )
      return fail(res, 400, "Tax bracket fields are required");
    const x = await prisma.taxBracket.create({
      data: {
        label,
        lowerBound: num(lowerBound),
        upperBound:
          upperBound === "" || upperBound == null ? null : num(upperBound),
        rate: num(rate),
        fixedTax: num(fixedTax),
        effectiveFrom: dateOnly(effectiveFrom),
        isActive: Boolean(isActive),
      },
    });
    await audit(req, "CREATE", "TAX_BRACKET", x.id, { label });
    res.status(201).json(x);
  } catch (e) {
    console.error(e);
    fail(res, 400, "Could not create tax bracket");
  }
});
app.patch(
  "/api/tax-brackets/:id",
  auth,
  allow(Role.ADMIN),
  async (req, res) => {
    try {
      const data = {};
      for (const k of ["label", "isActive"])
        if (req.body[k] !== undefined) data[k] = req.body[k];
      for (const k of ["lowerBound", "upperBound", "rate", "fixedTax"])
        if (req.body[k] !== undefined)
          data[k] =
            req.body[k] === null || req.body[k] === ""
              ? null
              : num(req.body[k]);
      if (req.body.effectiveFrom)
        data.effectiveFrom = dateOnly(req.body.effectiveFrom);
      const x = await prisma.taxBracket.update({
        where: { id: num(req.params.id) },
        data,
      });
      await audit(req, "UPDATE", "TAX_BRACKET", x.id, {
        fields: Object.keys(data),
      });
      res.json(x);
    } catch (e) {
      fail(res, 400, "Could not update tax bracket");
    }
  },
);

app.get("/api/users", auth, allow(Role.ADMIN), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(users);
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not load users");
  }
});

app.post("/api/users", auth, allow(Role.ADMIN), async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const role = String(req.body.role || "").trim();

    /*
     * Users & Accounts is only for privileged/system accounts.
     *
     * Employee accounts are not created from here.
     * Employees are created from the Employees section.
     */
    const allowedRoles = [Role.ADMIN, Role.HR, Role.PAYROLL_MANAGER];

    if (!email || !role) {
      return fail(res, 400, "Email and role are required");
    }

    if (!allowedRoles.includes(role)) {
      return fail(
        res,
        400,
        "Only Admin, HR, and Payroll Manager accounts can be created here",
      );
    }

    /*
     * An employee must NOT be selected from this screen.
     *
     * Even if somebody manually sends employeeId through the API,
     * we ignore it and create the system account without employee
     * association.
     */
    const limits = await prisma.accountLimit.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        maxAdmins: 3,
        maxHr: 10,
        maxPayrollManagers: 5,
      },
    });

    const roleLimit = {
      [Role.ADMIN]: limits.maxAdmins,
      [Role.HR]: limits.maxHr,
      [Role.PAYROLL_MANAGER]: limits.maxPayrollManagers,
    }[role];

    /*
     * Count only active accounts.
     *
     * Therefore:
     * - Deactivated account does not consume a slot.
     * - Reactivating it will consume a slot again.
     */
    const activeCount = await prisma.user.count({
      where: {
        role,
        isActive: true,
      },
    });

    if (activeCount >= roleLimit) {
      return fail(
        res,
        409,
        `${role.replace("_", " ")} account limit reached (${activeCount}/${roleLimit})`,
      );
    }

    /*
     * Email must be unique.
     */
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        isActive: true,
        role: true,
      },
    });

    if (existingUser) {
      return fail(
        res,
        409,
        existingUser.isActive
          ? "An account with this email already exists"
          : "An account with this email already exists but is inactive",
      );
    }

    /*
     * Generate a random temporary password hash.
     * The user cannot use this password directly because
     * mustChangePassword=true.
     */
    const raw = randomToken();

    const hash = await passwordHash(crypto.randomBytes(24).toString("hex"));

    /*
     * Create a system account.
     *
     * employeeId is deliberately NULL.
     */
    const user = await prisma.user.create({
      data: {
        employeeId: null,
        email,
        passwordHash: hash,
        role,
        mustChangePassword: true,
      },
    });

    /*
     * Secure activation token.
     */
    const tokenHash = hashToken(raw);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    /*
     * Audit.
     *
     * No employee information is stored because this
     * account is not being created for an employee.
     */
    await audit(req, "ACCOUNT_CREATED", "USER", user.id, {
      role,
      accountType: "SYSTEM_ACCOUNT",
    });

    /*
     * Notification.
     */
    await notify(
      user.id,
      "Account created",
      "Your PayrollPro account was created. Use the secure activation link to set your password.",
      "SECURITY",
    );

    /*
     * Activation email.
     */
    const activationUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/?reset=${raw}`;

    await sendSecurityEmail({
      to: user.email,
      subject: "Your PayrollPro account",
      html: `
          <p>Your PayrollPro account has been created.</p>

          <p>
            <strong>Role:</strong>
            ${role.replace("_", " ")}
          </p>

          <p>
            <a href="${activationUrl}">
              Activate your account and set your password
            </a>
          </p>

          <p>This link expires in 24 hours.</p>
        `,
    }).catch(() => {});

    res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      employee: null,
      activationToken: process.env.NODE_ENV === "production" ? undefined : raw,
    });
  } catch (e) {
    console.error(e);

    fail(
      res,
      400,
      e.code === "P2002"
        ? "An account with this email already exists"
        : "Could not create account",
    );
  }
});
app.patch(
  "/api/users/:id/status",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id),
        active = Boolean(req.body.isActive);
      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) return fail(res, 404, "User not found");
      if (target.role === Role.ADMIN && req.user.id !== target.id)
        return fail(res, 403, "Only the same Admin can manage this account");
      if (req.user.role === Role.HR && target.role !== Role.EMPLOYEE)
        return fail(res, 403, "HR can only manage employee accounts");
      const user = await prisma.user.update({
        where: { id },
        data: { isActive: active },
        select: { id: true, email: true, role: true, isActive: true },
      });
      await audit(
        req,
        active ? "ACCOUNT_REACTIVATED" : "ACCOUNT_DEACTIVATED",
        "USER",
        id,
        { role: target.role },
      );
      await security(
        req,
        id,
        active ? "ACCOUNT_REACTIVATED" : "ACCOUNT_DEACTIVATED",
        { actor: req.user.id },
      );
      await notify(
        id,
        active ? "Account reactivated" : "Account deactivated",
        active
          ? "Your PayrollPro account has been reactivated."
          : "Your PayrollPro account has been deactivated.",
        "SECURITY",
      );
      res.json(user);
    } catch (e) {
      fail(res, 400, "Could not update account");
    }
  },
);

app.post(
  "/api/users/:id/force-password-reset",
  auth,
  allow(Role.ADMIN),
  async (req, res) => {
    try {
      const id = num(req.params.id);
      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) return fail(res, 404, "User not found");
      await prisma.user.update({
        where: { id },
        data: { mustChangePassword: true },
      });
      await audit(req, "ADMIN_FORCED_PASSWORD_RESET", "USER", id, {
        targetRole: target.role,
      });
      await security(req, id, "ADMIN_FORCED_PASSWORD_RESET", {
        actor: req.user.id,
      });
      await notify(
        id,
        "Security alert",
        "An administrator requires you to change your PayrollPro password at your next sign-in.",
        "SECURITY",
      );
      res.json({ message: "Password change required at next sign-in" });
    } catch (e) {
      fail(res, 400, "Could not force password reset");
    }
  },
);

app.get(
  "/api/reports/payroll.csv",
  auth,
  allow(Role.ADMIN, Role.HR, Role.PAYROLL_MANAGER),
  async (req, res) => {
    try {
      const year = num(req.query.year),
        month = num(req.query.month);
      const period = await prisma.payrollPeriod.findUnique({
        where: { year_month: { year, month } },
        include: { records: { include: { employee: true } } },
      });
      if (!period) return fail(res, 404, "Payroll period not found");
      const rows = [
        [
          "Employee Code",
          "Employee Name",
          "Basic",
          "Allowances",
          "Overtime",
          "Unpaid Leave Deduction",
          "Gross",
          "Employee SSF",
          "Employee PF",
          "Tax",
          "Other Deductions",
          "Net",
          "Employer SSF",
          "Employer PF",
          "Status",
        ],
      ];
      for (const r of period.records)
        rows.push([
          r.employee.employeeCode,
          `${r.employee.firstName} ${r.employee.lastName}`,
          r.basic,
          r.allowances,
          r.overtime,
          r.unpaidLeaveDeduction,
          r.gross,
          r.employeeSSF,
          r.employeePF,
          r.tax,
          r.otherDeductions,
          r.net,
          r.employerSSF,
          r.employerPF,
          period.status,
        ]);
      const csv = rows
        .map((row) =>
          row
            .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
            .join(","),
        )
        .join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="payroll-${year}-${String(month).padStart(2, "0")}.csv"`,
      );
      res.send(csv);
    } catch (e) {
      console.error(e);
      fail(res, 500, "Could not export payroll");
    }
  },
);

app.get("/api/performance/cycles", auth, async (req, res) => {
  try {
    res.json(
      await prisma.performanceCycle.findMany({
        include: { _count: { select: { goals: true, reviews: true } } },
        orderBy: { year: "desc" },
      }),
    );
  } catch (e) {
    fail(res, 500, "Could not load performance cycles");
  }
});
app.post("/api/performance/cycles", auth, allow(Role.HR), async (req, res) => {
  try {
    const x = await prisma.performanceCycle.create({
      data: {
        name: req.body.name,
        year: num(req.body.year),
        startDate: dateOnly(req.body.startDate),
        endDate: dateOnly(req.body.endDate),
        status: PerformanceStatus.OPEN,
      },
    });
    await audit(req, "CREATE", "PERFORMANCE_CYCLE", x.id, { name: x.name });
    res.status(201).json(x);
  } catch (e) {
    console.error(e);
    fail(res, 400, "Could not create performance cycle");
  }
});
app.post("/api/performance/goals", auth, allow(Role.HR), async (req, res) => {
  try {
    const x = await prisma.performanceGoal.create({
      data: {
        cycleId: num(req.body.cycleId),
        employeeId: num(req.body.employeeId),
        title: req.body.title,
        description: req.body.description || null,
        weight: num(req.body.weight),
        target: req.body.target === undefined ? null : num(req.body.target),
        actual: req.body.actual === undefined ? null : num(req.body.actual),
      },
    });
    if (Array.isArray(req.body.kpis))
      for (const k of req.body.kpis)
        await prisma.employeeKPI.create({
          data: {
            goalId: x.id,
            employeeId: x.employeeId,
            name: k.name,
            weight: num(k.weight),
          },
        });
    await audit(req, "CREATE", "PERFORMANCE_GOAL", x.id, {
      employeeId: x.employeeId,
    });
    res.status(201).json(x);
  } catch (e) {
    console.error(e);
    fail(res, 400, "Could not create goal");
  }
});
app.get("/api/performance/me", auth, async (req, res) => {
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { employeeId: true },
    });
    if (!u.employeeId) return res.json({ goals: [], reviews: [] });
    const [goals, reviews, avg] = await Promise.all([
      prisma.performanceGoal.findMany({
        where: { employeeId: u.employeeId },
        include: { kpis: true, cycle: true },
        orderBy: { id: "desc" },
      }),
      prisma.performanceReview.findMany({
        where: { employeeId: u.employeeId },
        include: { cycle: true },
        orderBy: { id: "desc" },
      }),
      prisma.performanceReview.aggregate({
        _avg: { finalScore: true },
        where: { employeeId: u.employeeId, finalScore: { not: null } },
      }),
    ]);
    res.json({ goals, reviews, average: num(avg._avg.finalScore) });
  } catch (e) {
    fail(res, 500, "Could not load performance");
  }
});
app.post("/api/performance/reviews", auth, async (req, res) => {
  try {
    let employeeId = num(req.body.employeeId);
    if (req.user.role === Role.EMPLOYEE) {
      const u = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { employeeId: true },
      });
      employeeId = u.employeeId;
    }
    if (!employeeId) return fail(res, 400, "Employee required");
    const x = await prisma.performanceReview.upsert({
      where: {
        cycleId_employeeId: { cycleId: num(req.body.cycleId), employeeId },
      },
      update: {
        selfComment: req.body.selfComment,
        selfRating:
          req.body.selfRating === undefined
            ? undefined
            : num(req.body.selfRating),
      },
      create: {
        cycleId: num(req.body.cycleId),
        employeeId,
        selfComment: req.body.selfComment || null,
        selfRating:
          req.body.selfRating === undefined ? null : num(req.body.selfRating),
      },
    });
    await audit(req, "SAVE", "PERFORMANCE_REVIEW", x.id, { employeeId });
    res.json(x);
  } catch (e) {
    console.error(e);
    fail(res, 400, "Could not save review");
  }
});
app.patch(
  "/api/performance/reviews/:id",
  auth,
  allow(Role.HR),
  async (req, res) => {
    try {
      const r = await prisma.performanceReview.findUnique({
        where: { id: num(req.params.id) },
        include: { employee: true },
      });
      if (!r) return fail(res, 404, "Review not found");
      const score =
        req.body.finalScore === undefined ? null : num(req.body.finalScore);
      const grade =
        score === null
          ? null
          : score >= 90
            ? "OUTSTANDING"
            : score >= 80
              ? "EXCELLENT"
              : score >= 70
                ? "GOOD"
                : score >= 60
                  ? "SATISFACTORY"
                  : "NEEDS IMPROVEMENT";
      const x = await prisma.performanceReview.update({
        where: { id: r.id },
        data: {
          managerComment: req.body.managerComment,
          managerRating:
            req.body.managerRating === undefined
              ? undefined
              : num(req.body.managerRating),
          finalScore: score,
          grade,
          completedAt: score === null ? null : new Date(),
        },
      });
      await audit(req, "COMPLETE", "PERFORMANCE_REVIEW", r.id, {
        score,
        grade,
      });
      res.json(x);
    } catch (e) {
      console.error(e);
      fail(res, 400, "Could not update review");
    }
  },
);

app.get("/api/notifications", auth, async (req, res) => {
  try {
    const rows = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(rows);
  } catch (e) {
    fail(res, 500, "Could not load notifications");
  }
});
app.patch("/api/notifications/:id/read", auth, async (req, res) => {
  try {
    const row = await prisma.notification.updateMany({
      where: { id: num(req.params.id), userId: req.user.id },
      data: { isRead: true },
    });
    res.json({ updated: row.count });
  } catch (e) {
    fail(res, 400, "Could not update notification");
  }
});
app.get("/api/security/history", auth, async (req, res) => {
  try {
    res.json(
      await prisma.securityEvent.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    );
  } catch (e) {
    fail(res, 500, "Could not load security history");
  }
});
app.get("/api/settings", auth, async (req, res) => {
  try {
    const p = await prisma.userPreference.findUnique({
      where: { userId: req.user.id },
    });
    res.json(p || { theme: "system" });
  } catch (e) {
    fail(res, 500, "Could not load settings");
  }
});
app.patch("/api/settings", auth, async (req, res) => {
  try {
    const theme = String(req.body.theme || "");
    if (!validTheme(theme))
      return fail(res, 400, "Theme must be system, light or dark");
    const p = await prisma.userPreference.upsert({
      where: { userId: req.user.id },
      update: { theme },
      create: { userId: req.user.id, theme },
    });
    res.json(p);
  } catch (e) {
    fail(res, 400, "Could not save settings");
  }
});
app.get("/api/settings/security", auth, async (req, res) => {
  res.json({
    passwordChange: true,
    passwordReset: true,
    securityHistory: true,
    accountStatus: req.user.isActive,
  });
});

app.get("/api/audit", auth, async (req, res) => {
  try {
    let where = {};
    if (req.user.role === Role.HR)
      where = {
        entity: {
          in: [
            "EMPLOYEE",
            "ATTENDANCE",
            "LEAVE",
            "LEAVE_TYPE",
            "SALARY",
            "PERFORMANCE_GOAL",
            "PERFORMANCE_REVIEW",
          ],
        },
      };
    else if (req.user.role === Role.PAYROLL_MANAGER)
      where = {
        entity: { in: ["SALARY", "PAYROLL", "PAYSLIP", "TAX_BRACKET"] },
      };
    else if (req.user.role !== Role.ADMIN)
      return fail(res, 403, "You do not have permission for this action");
    res.json(
      await prisma.auditLog.findMany({
        where,
        include: { user: { select: { email: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    );
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not load audit logs");
  }
});
app.get(
  "/api/approvals",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const where =
        req.user.role === Role.ADMIN
          ? { status: ApprovalStatus.PENDING }
          : { status: ApprovalStatus.PENDING, type: ApprovalType.PAYROLL };
      res.json(
        await prisma.approvalRequest.findMany({
          where,
          include: {
            requestedBy: { select: { email: true, role: true } },
            reviewer: { select: { email: true, role: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
      );
    } catch (e) {
      fail(res, 500, "Could not load approvals");
    }
  },
);

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Unexpected server error"
        : err.message || "Unexpected server error",
  });
});

export { app, prisma };
if (process.env.NODE_ENV !== "test") {
  const server = app.listen(port, () =>
    console.log(`PayrollPro API running on http://localhost:${port}`),
  );
  const shutdown = async (signal) => {
    console.log(`${signal}: shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
// Backward-compatible organization route aliases.
app.get("/api/org/departments", auth, async (_req, res) => {
  try {
    res.json(await prisma.department.findMany({ orderBy: { name: "asc" } }));
  } catch {
    fail(res, 500, "Could not load departments");
  }
});
app.get("/api/org/designations", auth, async (_req, res) => {
  try {
    res.json(
      await prisma.designation.findMany({
        include: { department: true },
        orderBy: { title: "asc" },
      }),
    );
  } catch {
    fail(res, 500, "Could not load designations");
  }
});
app.get("/api/org/branches", auth, async (_req, res) => {
  try {
    res.json(await prisma.branch.findMany({ orderBy: { name: "asc" } }));
  } catch {
    fail(res, 500, "Could not load branches");
  }
});
app.post(
  "/api/org/branches",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const name = String(req.body.name || "").trim();
      if (!name) return fail(res, 400, "Branch name is required");
      const x = await prisma.branch.create({
        data: {
          name,
          address: req.body.address || null,
          phone: req.body.phone || null,
        },
      });
      await audit(req, "CREATE", "BRANCH", x.id, { name });
      res.status(201).json(x);
    } catch (e) {
      fail(
        res,
        400,
        e.code === "P2002"
          ? "Branch already exists"
          : "Could not create branch",
      );
    }
  },
);
app.patch(
  "/api/org/branches/:id",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id),
        data = {};
      if (req.body.name !== undefined) data.name = String(req.body.name).trim();
      if (req.body.address !== undefined)
        data.address = req.body.address || null;
      if (req.body.phone !== undefined) data.phone = req.body.phone || null;
      const x = await prisma.branch.update({ where: { id }, data });
      await audit(req, "UPDATE", "BRANCH", id, data);
      res.json(x);
    } catch {
      fail(res, 400, "Could not update branch");
    }
  },
);
app.delete(
  "/api/org/branches/:id",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id);
      await prisma.branch.delete({ where: { id } });
      await audit(req, "DELETE", "BRANCH", id, {});
      res.json({ ok: true });
    } catch {
      fail(res, 400, "Could not delete branch");
    }
  },
);
app.post(
  "/api/org/designations/bulk",
  auth,
  allow(Role.ADMIN),
  async (req, res) => {
    try {
      const input = Array.isArray(req.body.designations)
        ? req.body.designations
        : [];
      if (!input.length)
        return fail(res, 400, "At least one designation is required");
      const rows = input.map((x, i) => ({
        row: i + 1,
        title: String(x.title || "").trim(),
        departmentId:
          x.departmentId == null || x.departmentId === ""
            ? null
            : num(x.departmentId),
      }));
      const bad = rows.find((x) => !x.title || x.departmentId == null);
      if (bad)
        return fail(
          res,
          400,
          !bad.title
            ? `Designation name is required for row ${bad.row}`
            : `Department is required for row ${bad.row}`,
        );
      const seen = new Set();
      for (const x of rows) {
        const k = x.title.toLowerCase();
        if (seen.has(k))
          return fail(
            res,
            409,
            `Duplicate designation in this submission: ${x.title}`,
          );
        seen.add(k);
      }
      const deps = await prisma.department.findMany({
        where: { id: { in: [...new Set(rows.map((x) => x.departmentId))] } },
        select: { id: true },
      });
      const found = new Set(deps.map((x) => x.id));
      const miss = rows.find((x) => !found.has(x.departmentId));
      if (miss)
        return fail(res, 404, `Department not found for row ${miss.row}`);
      const existing = await prisma.designation.findMany({
        select: { title: true },
      });
      const em = new Set(existing.map((x) => x.title.toLowerCase()));
      for (const x of rows)
        if (em.has(x.title.toLowerCase()))
          return fail(res, 409, `Designation already exists: ${x.title}`);
      const created = await prisma.$transaction(async (tx) => {
        const out = [];
        for (const x of rows)
          out.push(
            await tx.designation.create({
              data: { title: x.title, departmentId: x.departmentId },
              include: { department: true },
            }),
          );
        return out;
      });
      for (const x of created)
        await audit(req, "CREATE", "DESIGNATION", x.id, {
          title: x.title,
          departmentId: x.departmentId,
        });
      res
        .status(201)
        .json({
          message: `${created.length} designation(s) created successfully`,
          count: created.length,
          designations: created,
        });
    } catch (e) {
      fail(
        res,
        400,
        e.code === "P2002"
          ? "One or more designations already exist"
          : "Could not create designations",
      );
    }
  },
);
app.post(
  "/api/org/departments",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const name = String(req.body.name || "").trim(),
        code = String(req.body.code || "")
          .trim()
          .toUpperCase();
      if (!name || !code)
        return fail(res, 400, "Department name and code are required");
      const x = await prisma.department.create({
        data: { name, code, nextEmployeeNo: 1 },
      });
      await audit(req, "CREATE", "DEPARTMENT", x.id, { name, code });
      res.status(201).json(x);
    } catch (e) {
      fail(
        res,
        400,
        e.code === "P2002"
          ? "Department name or code already exists"
          : "Could not create department",
      );
    }
  },
);
app.patch(
  "/api/org/departments/:id",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id),
        data = {};
      if (req.body.name !== undefined) data.name = String(req.body.name).trim();
      if (req.body.code !== undefined)
        data.code = String(req.body.code).trim().toUpperCase();
      const x = await prisma.department.update({ where: { id }, data });
      await audit(req, "UPDATE", "DEPARTMENT", id, data);
      res.json(x);
    } catch {
      fail(res, 400, "Could not update department");
    }
  },
);
app.delete(
  "/api/org/departments/:id",
  auth,
  allow(Role.ADMIN, Role.HR),
  async (req, res) => {
    try {
      const id = num(req.params.id);
      await prisma.department.delete({ where: { id } });
      await audit(req, "DELETE", "DEPARTMENT", id, {});
      res.json({ ok: true });
    } catch {
      fail(res, 400, "Could not delete department");
    }
  },
);
/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use((err, _req, res, _next) => {
  console.error(err);

  if (res.headersSent) {
    return;
  }

  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Unexpected server error"
        : err.message || "Unexpected server error",
  });
});

if (process.env.NODE_ENV !== "test") {
  const server = app.listen(port, () =>
    console.log(`PayrollPro API running on http://localhost:${port}`),
  );

  const shutdown = async (signal) => {
    console.log(`${signal}: shutting down`);

    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("SIGINT", () => shutdown("SIGINT"));
}
