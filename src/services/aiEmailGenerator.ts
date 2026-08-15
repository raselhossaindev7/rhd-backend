import { config } from "../config/env";

const OLLAMA_API_KEY = config.ollamaApiKey;
const OLLAMA_BASE_URL = "https://ollama.com";
const OLLAMA_MODEL = "minimax-m3:cloud";

const EMAIL_SYSTEM_PROMPT = `You are Rasel Hossain's AI email writer. You write professional, compelling emails for cold outreach, follow-ups, and business communication.

About Rasel Hossain:
- Full Stack Developer, AI Automation Engineer & DevOps Specialist
- 6+ years of experience since 2020
- Top Rated Seller on Fiverr with 168+ completed projects
- Based in Bangladesh, works with international clients worldwide

Skills:
- Frontend: React.js, Next.js, TypeScript, Angular, Vue.js, Tailwind CSS
- Backend: Node.js, NestJS, Express.js, Laravel, PHP
- Database: PostgreSQL, MySQL, MongoDB, Supabase, Firebase
- Mobile: React Native, Expo
- DevOps: Docker, AWS, Nginx, PM2, Cloudflare, CI/CD
- AI: n8n automation, AI API integration, Python automation workers

Services:
- SaaS platforms, dashboards, admin panels, CRM/ERP systems
- E-commerce platforms
- Mobile apps (React Native, Expo)
- AI integration and workflow automation
- DevOps, Docker, VPS deployment, CI/CD

Email Writing Rules:
1. Be professional but warm — not robotic or overly formal
2. Keep emails concise — 100-200 words max
3. Focus on VALUE for the recipient, not features
4. Include a clear call-to-action
5. Use short paragraphs (2-3 sentences max)
6. Never use images — text only for maximum deliverability
7. Personalize based on the recipient's info
8. Subject lines should be compelling but not spammy
9. Avoid spam triggers (FREE, GUARANTEED, ACT NOW, etc.)
10. Always sign off as Rasel Hossain`;

interface GenerateEmailRequest {
  type: "cold-outreach" | "follow-up" | "proposal" | "thank-you" | "custom";
  recipientName?: string;
  recipientCompany?: string;
  recipientRole?: string;
  purpose?: string;
  customPrompt?: string;
}

interface GeneratedEmail {
  subject: string;
  html: string;
  plainText: string;
}

export async function generateEmailWithAI(request: GenerateEmailRequest): Promise<GeneratedEmail> {
  if (!OLLAMA_API_KEY) {
    throw new Error("AI service not configured");
  }

  const typeInstructions: Record<string, string> = {
    "cold-outreach": `Write a cold outreach email to potential client.
- Goal: Start a conversation, not sell immediately
- Tone: Friendly, professional, curious about their business
- Length: 100-150 words
- Include: Brief intro, why you're reaching out, value proposition, soft CTA`,
    
    "follow-up": `Write a follow-up email after no response.
- Goal: Re-engage without being pushy
- Tone: Polite, understanding, adds new value
- Length: 80-120 words
- Include: Reference previous email, add new angle, easy CTA`,
    
    "proposal": `Write a project proposal email.
- Goal: Present your approach professionally
- Tone: Confident, detailed, results-focused
- Length: 150-200 words
- Include: Understanding of their need, your approach, timeline, next steps`,
    
    "thank-you": `Write a thank you / onboarding email.
- Goal: Make client feel welcomed and confident
- Tone: Warm, organized, professional
- Length: 100-150 words
- Include: Thank them, outline next steps, set expectations`,
    
    "custom": `Write a professional email based on the custom prompt provided.
- Adapt tone and length to the purpose
- Always maintain professionalism
- Include clear CTA`,
  };

  const prompt = `${typeInstructions[request.type] || typeInstructions["custom"]}

RECIPIENT INFO:
- Name: ${request.recipientName || "the recipient"}
- Company: ${request.recipientCompany || "their company"}
- Role: ${request.recipientRole || "N/A"}
- Purpose: ${request.purpose || "Business inquiry"}
${request.customPrompt ? `- Custom Instructions: ${request.customPrompt}` : ""}

Return ONLY a JSON object in this exact format:
{
  "subject": "Compelling subject line here",
  "html": "<p>First paragraph...</p><p>Second paragraph...</p><p>Closing paragraph...</p>",
  "plainText": "Plain text version of the email"
}

IMPORTANT:
- HTML should use inline styles for email compatibility
- Use professional formatting: paragraphs, bold text where needed
- No images, no external CSS
- Subject line should be 40-60 characters
- Make it personal and specific to the recipient`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OLLAMA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: EMAIL_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[AI EMAIL GENERATOR ERROR]", response.status, err);
    throw new Error("AI service error");
  }

  const data: any = await response.json();
  const content = data.message?.content || "";

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Invalid AI response format");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      subject: parsed.subject || "Business Inquiry",
      html: wrapInEmailTemplate(parsed.html || "", request.recipientName),
      plainText: parsed.plainText || "",
    };
  } catch (parseError) {
    throw new Error("Failed to parse AI response");
  }
}

function wrapInEmailTemplate(bodyContent: string, recipientName?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#F8F9FB;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F8F9FB;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:0 0 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding:24px 32px;background-color:#FFFFFF;border-radius:16px 16px 0 0;border-bottom:1px solid #F3F4F6;">
                    <div style="font-size:24px;font-weight:800;color:#7B2CBF;letter-spacing:-0.5px;">Rasel Hossain</div>
                    <div style="font-size:12px;color:#9CA3AF;margin-top:2px;letter-spacing:0.5px;">Full Stack Developer & AI Automation Engineer</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding:0 0 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding:32px;background-color:#FFFFFF;border-radius:16px;border:1px solid #F3F4F6;">
                    <div style="font-size:16px;color:#1A1725;line-height:1.8;">
                      ${bodyContent}
                    </div>
                    
                    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #F3F4F6;">
                      <p style="margin:0;font-size:14px;color:#1A1725;">
                        Best regards,<br>
                        <strong style="color:#7B2CBF;">Rasel Hossain</strong>
                      </p>
                      <p style="margin:4px 0 0 0;font-size:12px;color:#9CA3AF;">
                        Top Rated Seller on Fiverr | 168+ Projects Completed
                      </p>
                      <p style="margin:8px 0 0 0;font-size:12px;">
                        <a href="https://raselhossain.dev" style="color:#7B2CBF;text-decoration:none;">raselhossain.dev</a> &nbsp;|&nbsp;
                        <a href="mailto:raselhossaindev7@gmail.com" style="color:#7B2CBF;text-decoration:none;">raselhossaindev7@gmail.com</a>
                      </p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding:16px 32px;background-color:#FFFFFF;border-radius:0 0 16px 16px;border-top:1px solid #F3F4F6;">
                    <div style="font-size:11px;color:#9CA3AF;text-align:center;">
                      This email was sent by Rasel Hossain | raselhossain.dev
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function generateSubjectLines(
  recipientName: string,
  recipientCompany: string,
  purpose: string
): Promise<string[]> {
  if (!OLLAMA_API_KEY) {
    throw new Error("AI service not configured");
  }

  const prompt = `Generate 5 compelling email subject lines for a cold outreach email.

RECIPIENT: ${recipientName} at ${recipientCompany}
PURPOSE: ${purpose}

RULES:
- 40-60 characters each
- No spam triggers (FREE, GUARANTEED, etc.)
- Personal when possible
- Create curiosity or offer value
- Professional tone

Return ONLY a JSON array of strings:
["Subject 1", "Subject 2", "Subject 3", "Subject 4", "Subject 5"]`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OLLAMA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: EMAIL_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error("AI service error");
  }

  const data: any = await response.json();
  const content = data.message?.content || "[]";

  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Invalid AI response format");
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Failed to parse AI response");
  }
}
