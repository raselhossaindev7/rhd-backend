// ─── Professional Email Templates ─────────────────────────
// Color Theory: Light BG + Dark Text = Maximum readability
// Primary: #7B2CBF (Purple) | Accent: #C49A5C (Gold) | CTA: #00C4A8 (Teal)

const COLORS = {
  bg: "#FFFFFF",
  bgAlt: "#F8F9FB",
  bgAccent: "#F3F0FF",
  text: "#1A1725",
  textSecondary: "#4B5563",
  textMuted: "#9CA3AF",
  primary: "#7B2CBF",
  primaryLight: "#9D4EDD",
  gold: "#C49A5C",
  goldLight: "#F0C38E",
  teal: "#00C4A8",
  border: "#E5E7EB",
  borderLight: "#F3F4F6",
};

function baseWrapper(content: string, previewText?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Rasel Hossain</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bgAlt};font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}</div>` : ""}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLORS.bgAlt};">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">
          ${content}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function header(): string {
  return `
    <tr>
      <td style="padding:0 0 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="padding:24px 32px;background-color:${COLORS.bg};border-radius:16px 16px 0 0;border-bottom:1px solid ${COLORS.borderLight};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <div style="font-size:24px;font-weight:800;color:${COLORS.primary};letter-spacing:-0.5px;">Rasel Hossain</div>
                    <div style="font-size:12px;color:${COLORS.textMuted};margin-top:2px;letter-spacing:0.5px;">Full Stack Developer & AI Automation Engineer</div>
                  </td>
                  <td align="right">
                    <div style="font-size:11px;color:${COLORS.textMuted};">raselhossain.dev</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function footer(): string {
  return `
    <tr>
      <td style="padding:0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="padding:24px 32px;background-color:${COLORS.bg};border-radius:0 0 16px 16px;border-top:1px solid ${COLORS.borderLight};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <div style="font-size:12px;color:${COLORS.textMuted};line-height:1.6;">
                      <strong style="color:${COLORS.text};">Rasel Hossain</strong><br>
                      Full Stack Developer & AI Automation Engineer<br>
                      <a href="https://raselhossain.dev" style="color:${COLORS.primary};text-decoration:none;">raselhossain.dev</a> &nbsp;|&nbsp;
                      <a href="mailto:raselhossaindev7@gmail.com" style="color:${COLORS.primary};text-decoration:none;">raselhossaindev7@gmail.com</a>
                    </div>
                  </td>
                  <td align="right" valign="bottom">
                    <div style="font-size:11px;color:${COLORS.textMuted};">
                      Top Rated on Fiverr<br>
                      168+ Projects Completed
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function contentCard(children: string): string {
  return `
    <tr>
      <td style="padding:0 0 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="padding:32px;background-color:${COLORS.bg};border-radius:16px;border:1px solid ${COLORS.borderLight};">
              ${children}
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function ctaButton(text: string, url: string, color: string = COLORS.primary): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;">
      <tr>
        <td style="background-color:${color};border-radius:10px;">
          <a href="${url}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;letter-spacing:0.3px;">
            ${text}
          </a>
        </td>
      </tr>
    </table>`;
}

function divider(): string {
  return `<div style="height:1px;background-color:${COLORS.borderLight};margin:24px 0;"></div>`;
}

// ─── Template 1: Cold Outreach (Client) ──────────────────

export function coldOutreachClient(data: {
  clientName?: string;
  clientCompany?: string;
  service?: string;
  message?: string;
  [key: string]: any;
}): string {
  const body = `
    ${header()}
    ${contentCard(`
      <div style="font-size:16px;color:${COLORS.text};line-height:1.7;">
        <p style="margin:0 0 20px 0;">Hi <strong>${data.clientName}</strong>,</p>
        
        <p style="margin:0 0 20px 0;">
          I came across <strong>${data.clientCompany}</strong> and was impressed by your work in the industry. 
          I believe I can help you <strong style="color:${COLORS.primary};">${data.service}</strong> that would drive real results for your business.
        </p>

        <p style="margin:0 0 20px 0;">
          With <strong>6+ years</strong> of experience building SaaS platforms, dashboards, and automation systems 
          for international clients, I specialize in:
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;">
          <tr>
            <td style="padding:8px 16px;background-color:${COLORS.bgAccent};border-radius:8px;border-left:3px solid ${COLORS.primary};margin-bottom:8px;">
              <span style="font-size:14px;color:${COLORS.text};">Full Stack Development — React, Next.js, Node.js, PostgreSQL</span>
            </td>
          </tr>
          <tr><td style="height:8px;"></td></tr>
          <tr>
            <td style="padding:8px 16px;background-color:${COLORS.bgAccent};border-radius:8px;border-left:3px solid ${COLORS.primaryLight};">
              <span style="font-size:14px;color:${COLORS.text};">AI & Automation — n8n, AI API Integration, Custom Workflows</span>
            </td>
          </tr>
          <tr><td style="height:8px;"></td></tr>
          <tr>
            <td style="padding:8px 16px;background-color:${COLORS.bgAccent};border-radius:8px;border-left:3px solid ${COLORS.teal};">
              <span style="font-size:14px;color:${COLORS.text};">DevOps — Docker, AWS, CI/CD, VPS Deployment</span>
            </td>
          </tr>
        </table>

        ${data.message ? `<p style="margin:0 0 20px 0;font-style:italic;color:${COLORS.textSecondary};border-left:3px solid ${COLORS.gold};padding-left:16px;">"${data.message}"</p>` : ""}

        <p style="margin:0 0 8px 0;">
          I'd love to discuss how I can contribute to ${data.clientCompany}'s growth. 
          Would you be available for a quick <strong>15-minute call</strong> this week?
        </p>

        ${ctaButton("Book a Free Consultation", "https://raselhossain.dev/contact")}

        <div style="margin-top:28px;padding-top:20px;border-top:1px solid ${COLORS.borderLight};">
          <p style="margin:0;font-size:14px;color:${COLORS.text};">
            Best regards,<br>
            <strong style="color:${COLORS.primary};">Rasel Hossain</strong>
          </p>
          <p style="margin:4px 0 0 0;font-size:12px;color:${COLORS.textMuted};">
            Top Rated Seller on Fiverr | 168+ Projects Completed
          </p>
        </div>
      </div>
    `)}
    ${footer()}`;

  return baseWrapper(body, `Hi ${data.clientName}, I can help ${data.clientCompany} with ${data.service}...`);
}

// ─── Template 2: Cold Outreach (Startup) ─────────────────

export function coldOutreachStartup(data: {
  founderName?: string;
  startupName?: string;
  pitch?: string;
  [key: string]: any;
}): string {
  const body = `
    ${header()}
    ${contentCard(`
      <div style="font-size:16px;color:${COLORS.text};line-height:1.7;">
        <p style="margin:0 0 20px 0;">Hey <strong>${data.founderName}</strong>,</p>
        
        <p style="margin:0 0 20px 0;">
          Just checked out <strong>${data.startupName}</strong> — ${data.pitch}
        </p>

        <p style="margin:0 0 20px 0;">
          I help startups like yours build <strong>scalable technical infrastructure</strong> from the ground up. 
          From MVP to production-ready systems, I've done it all:
        </p>

        <table role="presentation" cellpadding="8" cellspacing="0" border="0" width="100%" style="background-color:${COLORS.bgAlt};border-radius:10px;margin:0 0 20px 0;">
          <tr>
            <td width="50%" style="font-size:13px;color:${COLORS.text};padding:12px;">
              <strong style="color:${COLORS.primary};">MVP Development</strong><br>
              <span style="color:${COLORS.textSecondary};">Launch in 2-4 weeks</span>
            </td>
            <td width="50%" style="font-size:13px;color:${COLORS.text};padding:12px;">
              <strong style="color:${COLORS.primary};">Scale Architecture</strong><br>
              <span style="color:${COLORS.textSecondary};">Handle 10x growth</span>
            </td>
          </tr>
          <tr>
            <td width="50%" style="font-size:13px;color:${COLORS.text};padding:12px;">
              <strong style="color:${COLORS.primary};">AI Integration</strong><br>
              <span style="color:${COLORS.textSecondary};">Smart automation</span>
            </td>
            <td width="50%" style="font-size:13px;color:${COLORS.text};padding:12px;">
              <strong style="color:${COLORS.primary};">DevOps & Deploy</strong><br>
              <span style="color:${COLORS.textSecondary};">CI/CD, Docker, AWS</span>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 20px 0;">
          I'm currently taking on <strong style="color:${COLORS.primary};">2 new projects this month</strong>. 
          If you're looking for a technical partner who understands both code and business, let's talk.
        </p>

        ${ctaButton("Let's Build Together", "https://raselhossain.dev/contact")}

        <div style="margin-top:28px;padding-top:20px;border-top:1px solid ${COLORS.borderLight};">
          <p style="margin:0;font-size:14px;color:${COLORS.text};">
            Cheers,<br>
            <strong style="color:${COLORS.primary};">Rasel Hossain</strong>
          </p>
        </div>
      </div>
    `)}
    ${footer()}`;

  return baseWrapper(body, `Hey ${data.founderName}, I can help ${data.startupName} scale...`);
}

// ─── Template 3: Follow-Up ───────────────────────────────

export function followUpEmail(data: {
  name?: string;
  originalSubject?: string;
  daysSince?: number;
  [key: string]: any;
}): string {
  const body = `
    ${header()}
    ${contentCard(`
      <div style="font-size:16px;color:${COLORS.text};line-height:1.7;">
        <p style="margin:0 0 20px 0;">Hi <strong>${data.name}</strong>,</p>
        
        <p style="margin:0 0 20px 0;">
          I wanted to follow up on my previous email regarding <strong>${data.originalSubject}</strong>. 
          I know you're busy, so I'll keep this short.
        </p>

        <table role="presentation" cellpadding="16" cellspacing="0" border="0" width="100%" style="background-color:${COLORS.bgAccent};border-radius:10px;margin:0 0 20px 0;">
          <tr>
            <td>
              <div style="font-size:14px;color:${COLORS.text};line-height:1.6;">
                <strong style="color:${COLORS.primary};">Quick recap:</strong><br>
                I help businesses build scalable web applications, automate workflows, and integrate AI — 
                with <strong>6+ years</strong> and <strong>168+ completed projects</strong>.
              </div>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 20px 0;">
          Would a <strong>10-minute call</strong> work better for you? I'm flexible with timing.
        </p>

        ${ctaButton("Pick a Time", "https://raselhossain.dev/contact", COLORS.teal)}

        <div style="margin-top:28px;padding-top:20px;border-top:1px solid ${COLORS.borderLight};">
          <p style="margin:0;font-size:14px;color:${COLORS.text};">
            Best,<br>
            <strong style="color:${COLORS.primary};">Rasel Hossain</strong>
          </p>
        </div>
      </div>
    `)}
    ${footer()}`;

  return baseWrapper(body, `Following up on ${data.originalSubject}...`);
}

// ─── Template 4: Project Proposal ────────────────────────

export function projectProposal(data: {
  clientName?: string;
  projectName?: string;
  scope?: string;
  timeline?: string;
  budget?: string;
  [key: string]: any;
}): string {
  const body = `
    ${header()}
    ${contentCard(`
      <div style="font-size:16px;color:${COLORS.text};line-height:1.7;">
        <p style="margin:0 0 20px 0;">Hi <strong>${data.clientName}</strong>,</p>
        
        <p style="margin:0 0 20px 0;">
          Thank you for discussing <strong>${data.projectName}</strong> with me. 
          Here's my proposal based on our conversation:
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;">
          <tr>
            <td style="padding:16px;background-color:${COLORS.bgAlt};border-radius:10px 10px 0 0;border-bottom:2px solid ${COLORS.primary};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <div style="font-size:11px;color:${COLORS.textMuted};text-transform:uppercase;letter-spacing:1px;">Project</div>
                    <div style="font-size:16px;font-weight:600;color:${COLORS.text};margin-top:4px;">${data.projectName}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px;background-color:${COLORS.bgAlt};border-left:3px solid ${COLORS.primary};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="33%" valign="top" style="padding-right:12px;">
                    <div style="font-size:11px;color:${COLORS.textMuted};text-transform:uppercase;letter-spacing:1px;">Scope</div>
                    <div style="font-size:13px;color:${COLORS.text};margin-top:4px;line-height:1.5;">${data.scope}</div>
                  </td>
                  <td width="33%" valign="top" style="padding-right:12px;">
                    <div style="font-size:11px;color:${COLORS.textMuted};text-transform:uppercase;letter-spacing:1px;">Timeline</div>
                    <div style="font-size:13px;color:${COLORS.text};margin-top:4px;line-height:1.5;">${data.timeline}</div>
                  </td>
                  <td width="33%" valign="top">
                    <div style="font-size:11px;color:${COLORS.textMuted};text-transform:uppercase;letter-spacing:1px;">Budget</div>
                    <div style="font-size:13px;font-weight:600;color:${COLORS.primary};margin-top:4px;line-height:1.5;">${data.budget}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 20px 0;">
          I'm confident I can deliver exceptional results for this project. 
          Shall we proceed with the next steps?
        </p>

        ${ctaButton("Accept Proposal", "https://raselhossain.dev/contact", COLORS.teal)}

        <div style="margin-top:28px;padding-top:20px;border-top:1px solid ${COLORS.borderLight};">
          <p style="margin:0;font-size:14px;color:${COLORS.text};">
            Looking forward to working together,<br>
            <strong style="color:${COLORS.primary};">Rasel Hossain</strong>
          </p>
        </div>
      </div>
    `)}
    ${footer()}`;

  return baseWrapper(body, `Project proposal for ${data.projectName}...`);
}

// ─── Template 5: Thank You / Onboarding ──────────────────

export function thankYouOnboarding(data: {
  clientName?: string;
  projectName?: string;
  nextSteps?: string[];
  [key: string]: any;
}): string {
  const stepsList = (data.nextSteps || [])
    .map(
      (step, i) => `
    <tr>
      <td style="padding:12px 16px;background-color:${i === 0 ? COLORS.bgAccent : COLORS.bgAlt};border-radius:8px;border-left:3px solid ${i === 0 ? COLORS.primary : COLORS.border};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="top" style="padding-right:12px;">
              <div style="width:24px;height:24px;background-color:${i === 0 ? COLORS.primary : COLORS.border};border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:600;color:#FFFFFF;">
                ${i + 1}
              </div>
            </td>
            <td>
              <div style="font-size:14px;color:${COLORS.text};line-height:1.5;">${step}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr><td style="height:8px;"></td></tr>`
    )
    .join("");

  const body = `
    ${header()}
    ${contentCard(`
      <div style="font-size:16px;color:${COLORS.text};line-height:1.7;">
        <p style="margin:0 0 20px 0;">Hi <strong>${data.clientName}</strong>,</p>
        
        <p style="margin:0 0 20px 0;">
          Welcome aboard! I'm excited to work on <strong>${data.projectName}</strong> with you.
        </p>

        <table role="presentation" cellpadding="16" cellspacing="0" border="0" width="100%" style="background-color:${COLORS.bgAccent};border-radius:10px;margin:0 0 24px 0;">
          <tr>
            <td>
              <div style="font-size:18px;font-weight:700;color:${COLORS.primary};margin-bottom:4px;">${data.projectName}</div>
              <div style="font-size:13px;color:${COLORS.textSecondary};">Project initiated successfully</div>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 16px 0;font-weight:600;color:${COLORS.text};">Next Steps:</p>
        
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;">
          ${stepsList}
        </table>

        <p style="margin:0 0 8px 0;">
          If you have any questions, feel free to reach out anytime. I typically respond within <strong>2-4 hours</strong>.
        </p>

        ${ctaButton("View Project Dashboard", "https://raselhossain.dev/contact", COLORS.teal)}

        <div style="margin-top:28px;padding-top:20px;border-top:1px solid ${COLORS.borderLight};">
          <p style="margin:0;font-size:14px;color:${COLORS.text};">
            Thank you for your trust,<br>
            <strong style="color:${COLORS.primary};">Rasel Hossain</strong>
          </p>
        </div>
      </div>
    `)}
    ${footer()}`;

  return baseWrapper(body, `Welcome to ${data.projectName}! Here are your next steps...`);
}

// ─── Template 6: Newsletter / Broadcast ──────────────────

export function newsletterBroadcast(data: {
  title?: string;
  content?: string;
  ctaText?: string;
  ctaUrl?: string;
  [key: string]: any;
}): string {
  const body = `
    ${header()}
    ${contentCard(`
      <div style="font-size:16px;color:${COLORS.text};line-height:1.8;">
        <div style="font-size:11px;color:${COLORS.primary};text-transform:uppercase;letter-spacing:2px;font-weight:600;margin-bottom:12px;">Newsletter</div>
        <h1 style="margin:0 0 24px 0;font-size:24px;font-weight:700;color:${COLORS.text};line-height:1.3;">
          ${data.title}
        </h1>
        <div style="font-size:15px;color:${COLORS.textSecondary};line-height:1.8;">
          ${data.content}
        </div>
        ${data.ctaText && data.ctaUrl ? ctaButton(data.ctaText, data.ctaUrl) : ""}
      </div>
    `)}
    ${footer()}`;

  return baseWrapper(body, data.title);
}

// ─── Template Registry ───────────────────────────────────

export const EMAIL_TEMPLATES = {
  "cold-outreach-client": {
    name: "Cold Outreach — Client",
    description: "Professional cold email for potential clients",
    category: "outreach",
    subject: "Let's build something great together — Rasel Hossain",
    variables: ["clientName", "clientCompany", "service", "message"],
    generate: coldOutreachClient,
  },
  "cold-outreach-startup": {
    name: "Cold Outreach — Startup",
    description: "Friendly cold email for startup founders",
    category: "outreach",
    subject: "Helping ${startupName} scale — Rasel Hossain",
    variables: ["founderName", "startupName", "pitch"],
    generate: coldOutreachStartup,
  },
  "follow-up": {
    name: "Follow-Up",
    description: "Polite follow-up after no response",
    category: "follow-up",
    subject: "Following up — ${originalSubject}",
    variables: ["name", "originalSubject", "daysSince"],
    generate: followUpEmail,
  },
  "project-proposal": {
    name: "Project Proposal",
    description: "Formal project proposal with scope and budget",
    category: "proposal",
    subject: "Proposal: ${projectName} — Rasel Hossain",
    variables: ["clientName", "projectName", "scope", "timeline", "budget"],
    generate: projectProposal,
  },
  "thank-you-onboarding": {
    name: "Thank You / Onboarding",
    description: "Welcome new clients with next steps",
    category: "onboarding",
    subject: "Welcome to ${projectName}! — Rasel Hossain",
    variables: ["clientName", "projectName", "nextSteps"],
    generate: thankYouOnboarding,
  },
  "newsletter": {
    name: "Newsletter / Broadcast",
    description: "Send updates to all subscribers",
    category: "newsletter",
    subject: "${title}",
    variables: ["title", "content", "ctaText", "ctaUrl"],
    generate: newsletterBroadcast,
  },
} as const;

export type TemplateId = keyof typeof EMAIL_TEMPLATES;
