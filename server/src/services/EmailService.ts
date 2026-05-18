import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = 'MEP Store IMS <noreply@mepstore.app>';

export async function sendWelcomeEmail(
  to: string,
  companyName: string,
  slug: string
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  await resend.emails.send({
    from:    FROM,
    to,
    subject: `مرحباً بك في MEP Store IMS — ${companyName}`,
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
        <h2 style="color:#1a3c5e;">مرحباً بك في MEP Store IMS! 🎉</h2>
        <p>تم إنشاء حسابك بنجاح لشركة <strong>${companyName}</strong>.</p>
        <p>لديك <strong>30 يوماً</strong> تجربة مجانية كاملة — بدون قيود.</p>
        <a href="${process.env.FRONTEND_URL}/app?tenant=${slug}"
           style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">
          ابدأ الآن
        </a>
        <p style="color:#6b7280;font-size:0.85rem;">بعد انتهاء التجربة يمكنك الاشتراك من $19/شهر.</p>
      </div>`,
  });
}

export async function sendUpgradeConfirmation(
  to: string,
  plan: string
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  const planName = plan === 'pro' ? 'المحترف' : 'المبتدئ';
  await resend.emails.send({
    from:    FROM,
    to,
    subject: 'تم تفعيل اشتراكك في MEP Store IMS ✅',
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
        <h2 style="color:#16a34a;">تم تفعيل الاشتراك بنجاح!</h2>
        <p>تم ترقية حسابك إلى باقة <strong>${planName}</strong>.</p>
        <p>يمكنك الآن استخدام جميع مميزات الباقة بلا حدود.</p>
        <a href="${process.env.FRONTEND_URL}"
           style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          اذهب للنظام
        </a>
      </div>`,
  });
}

export async function sendLimitWarningEmail(
  to: string,
  used: number,
  limit: number
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  await resend.emails.send({
    from:    FROM,
    to,
    subject: `تحذير: وصلت لـ ${used} من ${limit} معاملة هذا الشهر`,
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
        <h2 style="color:#d97706;">تنبيه استخدام</h2>
        <p>استخدمت <strong>${used} من ${limit}</strong> معاملة هذا الشهر.</p>
        <p>لتجنب انقطاع الخدمة، رقّي لباقة أعلى.</p>
        <a href="${process.env.FRONTEND_URL}/#pricing"
           style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          رقّي الآن
        </a>
      </div>`,
  });
}
