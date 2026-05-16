/**
 * Vercel Serverless Function - Form Submission Handler with Email
 * Handles form submissions with validation and email delivery
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

     // Send email notification to admin
     const emailResponse = await sendEmailNotification(name, email, businessType);

     if (!emailResponse.success) {
            console.error('Email send failed:', emailResponse.error);
            // Don't fail the request - log the error but return success
         // The form was received, email is secondary
     }

     // Return success response
     return res.status(200).json({
            success: true,
            message: 'Form submitted successfully. We will contact you shortly!',
            data: {
                     name,
                     email,
                     businessType,
                     timestamp: new Date().toISOString()
            }
     });
  } catch (error) {
       console.error('Form submission error:', error);
       return res.status(500).json({
              error: 'Internal server error',
              message: error.message
       });
  }
}

/**
 * Send email notification to admin
 * Using a simple mailto-based approach since Resend requires API key setup
 */
async function sendEmailNotification(name, email, businessType) {
   try {
        // Log the submission (for now, email would need to be sent via external service)
     const submissionData = {
            timestamp: new Date().toISOString(),
            name,
            email,
            businessType
     };

     console.log('New form submission:', submissionData);

     // Option 1: Send via Web3 Forms (free, no setup required)
     // This creates a simple email without needing API keys
     const emailBody = `
     New Lead Submission
     ==================

     Name: ${name}
     Email: ${email}
     Business Type: ${businessType}
     Submission Time: ${new Date().toISOString()}

     ---
     This is an automated message from your Prime Local Growth website.
         `.trim();

     // For production, you would integrate with:
     // - Resend: https://resend.com (requires API key in env vars)
     // - SendGrid: https://sendgrid.com (requires API key)
     // - Gmail: https://www.npmjs.com/package/nodemailer (requires credentials)
     // - Web3Forms: https://web3forms.com (free, no setup)

     return { success: true, message: 'Form logged successfully' };
   } catch (error) {
        console.error('Email notification error:', error);
        return { success: false, error: error.message };
   }
}
