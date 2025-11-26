import sgMail from '@sendgrid/mail';
import { getApiKey } from '../../services/api.key.service';

const SENDER_EMAIL = 'igorh@aidgenomics.com';

interface EmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export const sendEmail = async (companyId: string, params: EmailParams): Promise<{ success: boolean; message?: string; error?: string }> => {
  console.log(`\n📧 [SendGrid Service] ===== sendEmail CALLED =====`);
  console.log(`📧 [SendGrid Service] Company ID: ${companyId}`);
  console.log(`📧 [SendGrid Service] To: ${params.to}`);
  console.log(`📧 [SendGrid Service] Subject: ${params.subject}`);
  console.log(`📧 [SendGrid Service] Text length: ${params.text?.length || 0}`);
  console.log(`📧 [SendGrid Service] HTML length: ${params.html?.length || 0}`);

  try {
    console.log(`📧 [SendGrid Service] Fetching API key for company ${companyId}...`);
    const apiKey = await getApiKey(companyId, 'sendgrid_api_key');
    if (!apiKey) {
      console.error(`❌ [SendGrid Service] SendGrid API key not found for company ${companyId}`);
      throw new Error('SendGrid API key not found');
    }
    console.log(`📧 [SendGrid Service] API key found: ${apiKey.substring(0, 10)}...`);

    sgMail.setApiKey(apiKey);

    const msg = {
      to: params.to,
      from: SENDER_EMAIL,
      subject: params.subject,
      text: params.text,
      html: params.html,
    };

    console.log(`📧 [SendGrid Service] Sending email via SendGrid API...`);
    await sgMail.send(msg);
    console.log(`✅ [SendGrid Service] Email sent successfully to ${params.to}`);
    console.log(`✅ [SendGrid Service] ===== END sendEmail =====\n`);
    return { success: true, message: 'Email sent successfully' };
  } catch (error: any) {
    console.error(`❌ [SendGrid Service] Error sending email:`, error);
    let errorMessage = 'An error occurred while sending the email';
    if (error.response && error.response.body && error.response.body.errors) {
      errorMessage = error.response.body.errors.map((err: any) => err.message).join(', ');
    }
    console.error(`❌ [SendGrid Service] Error message: ${errorMessage}`);
    console.log(`❌ [SendGrid Service] ===== END sendEmail (ERROR) =====\n`);
    return { success: false, error: errorMessage };
  }
};

export const verifySendGridKey = async (key: string): Promise<boolean> => {
  try {
    sgMail.setApiKey(key);
    await sgMail.send({
      to: 'test@example.com',
      from: SENDER_EMAIL,
      subject: 'API Key Verification',
      text: 'This is a test email for API key verification.',
      html: '<p>This is a test email for API key verification.</p>',
    });
    return true;
  } catch (error) {
    console.error('Error verifying SendGrid key:', error);
    return false;
  }
};