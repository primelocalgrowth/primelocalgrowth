/**
 * Vercel Serverless Function - Form Submission Handler with Email
 * Handles form submissions with validation and email delivery via Resend
 */

export default async function handler(req, res) {
     // Only allow POST requests
  if (req.method !== 'POST') {
         return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
         const { name, email, businessType } = req.body;

       // Validate required fields
       if (!name || !email || !businessType) {
                return res.status(400).json({
                           error: 'Please fill in all required fields',
                           received: { name, email, businessType }
                });
       }

       // Email validation
       const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
         if (!emailRegex.test(email)) {
                  return res.status(400).json({
                             error: 'Please enter a valid email address',
                             email: email
                  });
         }

       // Send email notification
       await sendEmailNotification(name, email, businessType);

       // Return success response
       return res.status(200).json({
                success: true,
                message: 'Form submitted successfully! We will be in touch soon.',
                data: {
                           name,
                           email,
                           businessType,
                           submittedAt: new Date().toISOString()
                }
       });

  } catch (error) {
         console.error('Form submission error:', error);
         return res.status(500).json({
                  error: 'An error occurred while processing your submission',
                  details: error.message
         });
  }
}

/**
 * Send email notification via Resend
 * @param {string} name - Submitter's name
 * @param {string} email - Submitter's email
 * @param {string} businessType - Type of business
 */
async function sendEmailNotification(name, email, businessType) {
     try {
            const apiKey = process.env.RESEND_API_KEY;

       if (!apiKey) {
                throw new Error('RESEND_API_KEY environment variable is not set');
       }

       // Create HTML email template
       const emailHtml = `
             <!DOCTYPE html>
                   <html>
                           <head>
                                     <meta charset="UTF-8">
                                               <style>
                                                           body { font-family: Arial, sans-serif; color: #333; background-color: #f5f5f5; }
                                                                       .container { max-width: 600px; margin: 0 auto; background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                                                                                   .header { border-bottom: 3px solid #f59e0b; padding-bottom: 15px; margin-bottom: 20px; }
                                                                                               .header h1 { color: #1a1a1a; margin: 0; font-size: 24px; }
                                                                                                           .content { line-height: 1.6; }
                                                                                                                       .field { margin: 15px 0; padding: 10px; background-color: #f9fafb; border-left: 4px solid #f59e0b; }
                                                                                                                                   .label { font-weight: bold; color: #1f2937; margin-bottom: 5px; }
                                                                                                                                               .value { color: #4b5563; font-size: 14px; }
                                                                                                                                                           .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }
                                                                                                                                                                       .cta { margin: 20px 0; }
                                                                                                                                                                                   .button { background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; }
                                                                                                                                                                                             </style>
                                                                                                                                                                                                     </head>
                                                                                                                                                                                                             <body>
                                                                                                                                                                                                                       <div class="container">
                                                                                                                                                                                                                                   <div class="header">
                                                                                                                                                                                                                                                 <h1>New Lead Submission</h1>
                                                                                                                                                                                                                                                             </div>
                                                                                                                                                                                                                                                                         <div class="content">
                                                                                                                                                                                                                                                                                       <p>You have received a new lead from your website contact form:</p>
                                                                                                                                                                                                                                                                                                     
                                                                                                                                                                                                                                                                                                                   <div class="field">
                                                                                                                                                                                                                                                                                                                                   <div class="label">Name:</div>
                                                                                                                                                                                                                                                                                                                                                   <div class="value">${escapeHtml(name)}</div>
                                                                                                                                                                                                                                                                                                                                                                 </div>
                                                                                                                                                                                                                                                                                                                                                                               
                                                                                                                                                                                                                                                                                                                                                                                             <div class="field">
                                                                                                                                                                                                                                                                                                                                                                                                             <div class="label">Email:</div>
                                                                                                                                                                                                                                                                                                                                                                                                                             <div class="value"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></div>
                                                                                                                                                                                                                                                                                                                                                                                                                                           </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                         
                                                                                                                                                                                                                                                                                                                                                                                                                                                                       <div class="field">
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       <div class="label">Business Type:</div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       <div class="value">${escapeHtml(businessType)}</div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 <div class="field">
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 <div class="label">Submitted:</div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 <div class="value">${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}</div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           <div class="cta">
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           <p>Next step: Follow up with ${escapeHtml(name)} at your earliest convenience.</p>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 <div class="footer">
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               <p>This email was sent from your Prime Local Growth contact form at www.primelocalgrowth.com</p>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             </body>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   </html>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       `;

       // Send email via Resend API
       const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                           'Authorization': `Bearer ${apiKey}`,
                           'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                           from: 'onboarding@resend.dev', // Will be replaced with custom domain after verification
                           to: 'adam@primelocalgrowth.com',
                           replyTo: email,
                           subject: `New Lead: ${name} (${businessType})`,
                           html: emailHtml,
                           tags: [
                              {
                                             name: 'category',
                                             value: 'lead_submission'
                              }
                                      ]
                })
       });

       if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Resend API error: ${JSON.stringify(errorData)}`);
       }

       const result = await response.json();
            console.log('Email sent successfully:', result.id);
            return result;

     } catch (error) {
            console.error('Email sending error:', error);
            // Log error but don't fail the form submission
       // In production, you might want to send an alert notification
       throw error;
     }
}

/**
 * Escape HTML special characters to prevent injection
 */
function escapeHtml(text) {
     if (!text) return '';
     const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
     };
     return text.replace(/[&<>"']/g, (m) => map[m]);
}
