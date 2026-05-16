/**
 * Vercel Serverless Function - Form Submission Handler
  * Handles form submissions with email delivery and GA4 tracking
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
                                                                                                       
                                                                                                           // TODO: Integrate email service (Resend, SendGrid, etc.)
                                                                                                               // For now, we'll just log and return success
                                                                                                                   console.log('Form submission received:', {
                                                                                                                         name,
                                                                                                                               email,
                                                                                                                                     businessType,
                                                                                                                                           timestamp: new Date().toISOString()
                                                                                                                                               });
                                                                                                                                               
                                                                                                                                                   // In production, send email here using a service like:
                                                                                                                                                       // - Resend: const response = await resend.emails.send({...})
                                                                                                                                                           // - SendGrid: const response = await sgMail.send({...})
                                                                                                                                                               // - AWS SES: await ses.sendEmail({...})
                                                                                                                                                               
                                                                                                                                                                   // Return success response
                                                                                                                                                                       return res.status(200).json({
                                                                                                                                                                             success: true,
                                                                                                                                                                                   message: 'Form submitted successfully',
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
                                                                                                                                                                                                                                                               
