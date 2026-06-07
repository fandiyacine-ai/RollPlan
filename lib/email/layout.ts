// Shared HTML wrapper for lifecycle emails — keeps a consistent dark, branded look
// without pulling in a templating dependency.
export function emailLayout({ preheader, title, body, ctaLabel, ctaUrl }: {
  preheader: string
  title: string
  body: string
  ctaLabel?: string
  ctaUrl?: string
}): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0; padding:0; background-color:#09090b; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none; font-size:0; color:#09090b; line-height:0; max-height:0; max-width:0; opacity:0; overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="background-color:#09090b; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px; background-color:#18181b; border:1px solid #27272a; border-radius:16px; overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <p style="margin:0; font-size:14px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#a78bfa;">RollPlan</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 8px 32px;">
                <h1 style="margin:0; font-size:22px; line-height:1.3; color:#fafafa; font-weight:700;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 8px 32px; font-size:15px; line-height:1.6; color:#d4d4d8;">
                ${body}
              </td>
            </tr>
            ${ctaLabel && ctaUrl ? `
            <tr>
              <td style="padding:16px 32px 8px 32px;">
                <a href="${ctaUrl}" style="display:inline-block; background-color:#8b5cf6; color:#ffffff; text-decoration:none; font-weight:600; font-size:14px; padding:12px 22px; border-radius:10px;">${ctaLabel}</a>
              </td>
            </tr>` : ''}
            <tr>
              <td style="padding:28px 32px 28px 32px;">
                <p style="margin:0; font-size:12px; color:#52525b;">RollPlan — AI-powered BJJ match analysis · rollplan.ai</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
