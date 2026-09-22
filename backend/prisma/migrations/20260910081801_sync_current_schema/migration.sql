/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `Department` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `Department` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."PasswordTokenType" AS ENUM ('ACTIVATION', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "public"."Department" ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "nextEmployeeNo" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "public"."PasswordResetToken" ADD COLUMN     "type" "public"."PasswordTokenType" NOT NULL DEFAULT 'PASSWORD_RESET';

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "public"."Department"("code");
