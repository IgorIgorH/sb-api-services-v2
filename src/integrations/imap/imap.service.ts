import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { getApiKey } from '../../services/api.key.service';

interface ImapConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

interface EmailSummary {
  id: number;
  from: string;
  subject: string;
  date: string;
  preview: string;
  hasAttachments: boolean;
}

interface EmailDetail {
  id: number;
  from: string;
  to: string[];
  subject: string;
  date: string;
  text: string;
  html: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
}

/**
 * Get IMAP configuration from company API keys
 */
const getImapConfig = async (companyId: string): Promise<ImapConfig> => {
  console.log(`\n📧 [IMAP Service] Getting IMAP config for company ${companyId}...`);

  const user = await getApiKey(companyId, 'imap_email');
  const password = await getApiKey(companyId, 'imap_password');
  const host = await getApiKey(companyId, 'imap_host');
  const port = await getApiKey(companyId, 'imap_port');
  const tls = await getApiKey(companyId, 'imap_tls');

  if (!user || !password || !host) {
    console.error(`❌ [IMAP Service] Missing required IMAP credentials`);
    throw new Error('IMAP credentials not configured. Please add imap_email, imap_password, and imap_host to your API keys.');
  }

  const config: ImapConfig = {
    user: user as string,
    password: password as string,
    host: host as string,
    port: port ? parseInt(port as string) : 993,
    tls: tls === 'false' ? false : true,
  };

  console.log(`📧 [IMAP Service] Config loaded: ${config.user}@${config.host}:${config.port} (TLS: ${config.tls})`);
  return config;
};

/**
 * Create IMAP connection
 */
const createConnection = (config: ImapConfig): Imap => {
  return new Imap({
    user: config.user,
    password: config.password,
    host: config.host,
    port: config.port,
    tls: config.tls,
    tlsOptions: { rejectUnauthorized: false },
  });
};

/**
 * Parse email message
 */
const parseEmail = (stream: any): Promise<ParsedMail> => {
  return new Promise((resolve, reject) => {
    simpleParser(stream, (err: any, parsed: ParsedMail) => {
      if (err) reject(err);
      else resolve(parsed);
    });
  });
};

/**
 * Fetch recent emails from inbox
 */
export const fetchInbox = async (
  companyId: string,
  limit: number = 20
): Promise<{ success: boolean; emails?: EmailSummary[]; error?: string }> => {
  console.log(`\n📧 [IMAP Service] ===== fetchInbox CALLED =====`);
  console.log(`📧 [IMAP Service] Company ID: ${companyId}`);
  console.log(`📧 [IMAP Service] Limit: ${limit}`);

  try {
    const config = await getImapConfig(companyId);
    const imap = createConnection(config);

    return new Promise((resolve, reject) => {
      imap.once('ready', () => {
        console.log(`📧 [IMAP Service] IMAP connection ready`);

        imap.openBox('INBOX', true, (err, box) => {
          if (err) {
            console.error(`❌ [IMAP Service] Error opening inbox:`, err);
            imap.end();
            return reject(err);
          }

          console.log(`📧 [IMAP Service] Inbox opened, total messages: ${box.messages.total}`);

          if (box.messages.total === 0) {
            console.log(`📧 [IMAP Service] No messages in inbox`);
            imap.end();
            return resolve({ success: true, emails: [] });
          }

          const fetchLimit = Math.min(limit, box.messages.total);
          const start = Math.max(1, box.messages.total - fetchLimit + 1);
          const end = box.messages.total;

          console.log(`📧 [IMAP Service] Fetching messages ${start}:${end}`);

          const fetch = imap.seq.fetch(`${start}:${end}`, {
            bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
            struct: true,
          });

          const emails: EmailSummary[] = [];

          fetch.on('message', (msg, seqno) => {
            let emailData: any = { id: seqno };

            msg.on('body', async (stream, info) => {
              if (info.which === 'TEXT') {
                const parsed = await parseEmail(stream);
                emailData.preview = parsed.text?.substring(0, 200) || '';
              } else {
                let buffer = '';
                stream.on('data', (chunk) => {
                  buffer += chunk.toString('utf8');
                });
                stream.once('end', () => {
                  const header = Imap.parseHeader(buffer);
                  emailData.from = header.from?.[0] || '';
                  emailData.subject = header.subject?.[0] || '';
                  emailData.date = header.date?.[0] || '';
                });
              }
            });

            msg.once('attributes', (attrs) => {
              emailData.hasAttachments = attrs.struct?.some((part: any) =>
                part.disposition?.type === 'attachment'
              ) || false;
            });

            msg.once('end', () => {
              emails.push(emailData);
            });
          });

          fetch.once('error', (err) => {
            console.error(`❌ [IMAP Service] Fetch error:`, err);
            imap.end();
            reject(err);
          });

          fetch.once('end', () => {
            console.log(`✅ [IMAP Service] Fetched ${emails.length} emails`);
            imap.end();
            resolve({ success: true, emails: emails.reverse() });
          });
        });
      });

      imap.once('error', (err: any) => {
        console.error(`❌ [IMAP Service] Connection error:`, err);
        reject(err);
      });

      imap.once('end', () => {
        console.log(`📧 [IMAP Service] Connection ended`);
      });

      console.log(`📧 [IMAP Service] Connecting to IMAP server...`);
      imap.connect();
    });
  } catch (error: any) {
    console.error(`❌ [IMAP Service] Error in fetchInbox:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Read specific email by ID
 */
export const readEmail = async (
  companyId: string,
  emailId: number
): Promise<{ success: boolean; email?: EmailDetail; error?: string }> => {
  console.log(`\n📧 [IMAP Service] ===== readEmail CALLED =====`);
  console.log(`📧 [IMAP Service] Company ID: ${companyId}`);
  console.log(`📧 [IMAP Service] Email ID: ${emailId}`);

  try {
    const config = await getImapConfig(companyId);
    const imap = createConnection(config);

    return new Promise((resolve, reject) => {
      imap.once('ready', () => {
        console.log(`📧 [IMAP Service] IMAP connection ready`);

        imap.openBox('INBOX', true, (err, box) => {
          if (err) {
            console.error(`❌ [IMAP Service] Error opening inbox:`, err);
            imap.end();
            return reject(err);
          }

          console.log(`📧 [IMAP Service] Inbox opened, fetching message ${emailId}`);

          const fetch = imap.seq.fetch(emailId.toString(), {
            bodies: '',
            struct: true,
          });

          let emailData: Partial<EmailDetail> = { id: emailId };

          fetch.on('message', (msg) => {
            msg.on('body', async (stream) => {
              const parsed = await parseEmail(stream);

              emailData.from = parsed.from?.text || '';
              emailData.to = (Array.isArray(parsed.to)
                ? parsed.to.map((addr: any) => addr.address)
                : parsed.to?.value?.map((addr: any) => addr.address) || []);
              emailData.subject = parsed.subject || '';
              emailData.date = parsed.date?.toISOString() || '';
              emailData.text = parsed.text || '';
              emailData.html = parsed.html || '';
              emailData.attachments = parsed.attachments?.map((att: any) => ({
                filename: att.filename || 'unknown',
                contentType: att.contentType || 'application/octet-stream',
                size: att.size || 0,
              })) || [];
            });

            msg.once('end', () => {
              console.log(`✅ [IMAP Service] Email fetched successfully`);
              imap.end();
              resolve({ success: true, email: emailData as EmailDetail });
            });
          });

          fetch.once('error', (err) => {
            console.error(`❌ [IMAP Service] Fetch error:`, err);
            imap.end();
            reject(err);
          });
        });
      });

      imap.once('error', (err: any) => {
        console.error(`❌ [IMAP Service] Connection error:`, err);
        reject(err);
      });

      imap.once('end', () => {
        console.log(`📧 [IMAP Service] Connection ended`);
      });

      console.log(`📧 [IMAP Service] Connecting to IMAP server...`);
      imap.connect();
    });
  } catch (error: any) {
    console.error(`❌ [IMAP Service] Error in readEmail:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Search emails by criteria
 */
export const searchEmails = async (
  companyId: string,
  searchQuery: string,
  limit: number = 20
): Promise<{ success: boolean; emails?: EmailSummary[]; error?: string }> => {
  console.log(`\n📧 [IMAP Service] ===== searchEmails CALLED =====`);
  console.log(`📧 [IMAP Service] Company ID: ${companyId}`);
  console.log(`📧 [IMAP Service] Search query: ${searchQuery}`);
  console.log(`📧 [IMAP Service] Limit: ${limit}`);

  try {
    const config = await getImapConfig(companyId);
    const imap = createConnection(config);

    return new Promise((resolve, reject) => {
      imap.once('ready', () => {
        console.log(`📧 [IMAP Service] IMAP connection ready`);

        imap.openBox('INBOX', true, (err, box) => {
          if (err) {
            console.error(`❌ [IMAP Service] Error opening inbox:`, err);
            imap.end();
            return reject(err);
          }

          console.log(`📧 [IMAP Service] Inbox opened, searching emails...`);

          // Simple search criteria - can be enhanced based on searchQuery
          const searchCriteria = [['SUBJECT', searchQuery]];

          imap.search(searchCriteria, (err, results) => {
            if (err) {
              console.error(`❌ [IMAP Service] Search error:`, err);
              imap.end();
              return reject(err);
            }

            if (!results || results.length === 0) {
              console.log(`📧 [IMAP Service] No emails found matching search`);
              imap.end();
              return resolve({ success: true, emails: [] });
            }

            console.log(`📧 [IMAP Service] Found ${results.length} matching emails`);

            const fetchIds = results.slice(0, limit);
            const fetch = imap.fetch(fetchIds, {
              bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
              struct: true,
            });

            const emails: EmailSummary[] = [];

            fetch.on('message', (msg, seqno) => {
              let emailData: any = { id: seqno };

              msg.on('body', async (stream, info) => {
                if (info.which === 'TEXT') {
                  const parsed = await parseEmail(stream);
                  emailData.preview = parsed.text?.substring(0, 200) || '';
                } else {
                  let buffer = '';
                  stream.on('data', (chunk) => {
                    buffer += chunk.toString('utf8');
                  });
                  stream.once('end', () => {
                    const header = Imap.parseHeader(buffer);
                    emailData.from = header.from?.[0] || '';
                    emailData.subject = header.subject?.[0] || '';
                    emailData.date = header.date?.[0] || '';
                  });
                }
              });

              msg.once('attributes', (attrs) => {
                emailData.hasAttachments = attrs.struct?.some((part: any) =>
                  part.disposition?.type === 'attachment'
                ) || false;
              });

              msg.once('end', () => {
                emails.push(emailData);
              });
            });

            fetch.once('error', (err) => {
              console.error(`❌ [IMAP Service] Fetch error:`, err);
              imap.end();
              reject(err);
            });

            fetch.once('end', () => {
              console.log(`✅ [IMAP Service] Fetched ${emails.length} emails`);
              imap.end();
              resolve({ success: true, emails });
            });
          });
        });
      });

      imap.once('error', (err: any) => {
        console.error(`❌ [IMAP Service] Connection error:`, err);
        reject(err);
      });

      imap.once('end', () => {
        console.log(`📧 [IMAP Service] Connection ended`);
      });

      console.log(`📧 [IMAP Service] Connecting to IMAP server...`);
      imap.connect();
    });
  } catch (error: any) {
    console.error(`❌ [IMAP Service] Error in searchEmails:`, error);
    return { success: false, error: error.message };
  }
};
