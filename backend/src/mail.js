import nodemailer from 'nodemailer';

let transporter;
function getTransporter(){
  if(!process.env.SMTP_HOST) return null;
  if(!transporter) transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE||'false')==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined});
  return transporter;
}
export async function sendSecurityEmail({to,subject,html}){
  const t=getTransporter();
  if(!t) return false;
  await t.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to,subject,html});
  return true;
}
