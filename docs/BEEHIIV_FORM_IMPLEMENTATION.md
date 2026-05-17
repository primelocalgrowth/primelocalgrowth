# Beehiiv Form Integration - Implementation Guide

## CRITICAL: 3 STEPS TO COMPLETE

This guide provides exact code to add to your website and Beehiiv setup steps.

---

## STEP 1: Get Your Beehiiv Form ID (5 minutes)

1. Log into Beehiiv: https://app.beehiiv.com
2. Click **Settings** → **Subscription Forms**
3. Find your main form (likely named "Signup" or "Newsletter")
4. Click **Embed** or **Get Code**
5. Look for the code that includes `data-beehiiv-form="XXXXX"`
6. Copy the ID (the XXXXX part) - example: `abc123def456` or `local-edge`
7. **SAVE THIS ID** - you'll need it for Step 2

---

## STEP 2: Configure Beehiiv Automation (10 minutes)

In Beehiiv dashboard:

### Create Post-Subscribe Email Sequence:

**Email 1: Immediate (upon signup)**
- **Subject:** "Your Local Business Visibility Playbook (Inside)"
- **Body:** 
  ```
    Hi [subscriber name],

        Welcome to The Local Edge! Here's the resource you requested.

            [BUTTON/LINK: Download Your Visibility Playbook]

                This 5-page guide covers:
                  - The #1 mistake killing local business visibility
                    - Your visibility checklist
                      - The framework we use for clients
                        - One quick win you can implement today

                            Let me know what you think.

                                — Adam
                                  Prime Local Growth
                                    ```

                                    **Email 2: Day 2**
                                    - **Subject:** "Why I focus on local businesses"
                                    - **Body:**
                                      ```
                                        After spending 10+ years in the Air Force learning precision and operations, 
                                          I realized local businesses were struggling with the same problem: getting found.

                                              That's why I focus exclusively on local businesses. It's what I know. It's what I'm obsessed with.

                                                  Next Thursday: Your first weekly insight.

                                                      — Adam
                                                        ```

                                                        **Email 3: Day 4**
                                                        - **Subject:** "One thing that changed the game"
                                                        - **Body:**
                                                          ```
                                                            This single strategy has generated $2M+ for our clients.

                                                                [Share your best tip about Google visibility, social media, or ads]

                                                                    Try it this week. Let me know what happens.

                                                                        — Adam
                                                                          ```

                                                                          **Email 4: Day 7**
                                                                          - **Subject:** "Let's talk about your visibility"
                                                                          - **Body:**
                                                                            ```
                                                                              You've read the playbook. You've seen a few strategies.

                                                                                  The question is: Are you ready to apply this to YOUR business?

                                                                                      If yes, let's talk. 20 minutes. No commitment. Just a conversation about what's possible.

                                                                                          [BUTTON/LINK: Schedule Your Call]
                                                                                            Link: https://calendly.com/adam-yoururl or your booking link

                                                                                                — Adam
                                                                                                  ```

                                                                                                  ### Set PDF Link:
                                                                                                  - In the first post-subscribe email, add a link to your lead magnet PDF
                                                                                                  - Host on Google Drive (get shareable link) or your server
                                                                                                  - Test the link before going live

                                                                                                  ---

                                                                                                  ## STEP 3: Add Code to Your Website (20 minutes)

                                                                                                  **IMPORTANT:** Replace `YOUR_FORM_ID` with the actual ID from Beehiiv (Step 1)

                                                                                                  ### Location 1: Hero Section (After "See Results" button)

                                                                                                  Find this line in index.html:
                                                                                                  ```html
                                                                                                  <p style="font-size:14px;color:#9ca3af">✓ Used by 50+ local businesses | ✓ Simple process | ✓ Real results</p></section>
                                                                                                  ```

                                                                                                  Replace with:
                                                                                                  ```html
                                                                                                  <p style="font-size:14px;color:#9ca3af">✓ Used by 50+ local businesses | ✓ Simple process | ✓ Real results</p>
                                                                                                  <div style="margin-top:40px;padding:25px;background:rgba(245,158,11,0.08);border-radius:8px;border:1px solid rgba(245,158,11,0.2);max-width:400px;margin-left:auto;margin-right:auto">
                                                                                                    <p style="font-size:13px;color:#f59e0b;margin-bottom:15px;font-weight:600;text-align:center">📧 Get Weekly Visibility Insights</p>
                                                                                                      <script async src="https://beehiiv.com/embed.js"></script>
                                                                                                        <div data-beehiiv-form="YOUR_FORM_ID"></div>
                                                                                                        </div>
                                                                                                        </section>
                                                                                                        ```
                                                                                                        
                                                                                                        ### Location 2: Footer (Before closing </footer>)
                                                                                                        
                                                                                                        Find the closing `</footer>` tag and add BEFORE it:
                                                                                                        ```html
                                                                                                        <div style="margin:30px 0 40px;padding:20px;background:rgba(245,158,11,0.08);border-radius:8px;max-width:400px;margin-left:auto;margin-right:auto;text-align:center">
                                                                                                          <p style="color:#f59e0b;font-weight:600;margin-bottom:12px;font-size:14px">📰 Get The Local Edge Newsletter</p>
                                                                                                            <p style="font-size:13px;color:#9ca3af;margin-bottom:15px">Weekly tips on Google visibility, social media, and ads</p>
                                                                                                              <script async src="https://beehiiv.com/embed.js"></script>
                                                                                                                <div data-beehiiv-form="YOUR_FORM_ID"></div>
                                                                                                                </div>
                                                                                                                ```
                                                                                                                
                                                                                                                ### Location 3: Contact Section (After main contact form, before </section>)
                                                                                                                
                                                                                                                Find the closing `</form>` in the contact section and add AFTER it (before `</section>`):
                                                                                                                ```html
                                                                                                                <div style="margin-top:30px;text-align:center">
                                                                                                                  <p style="color:#9ca3af;font-size:13px;margin-bottom:15px">Or get weekly tips:</p>
                                                                                                                    <script async src="https://beehiiv.com/embed.js"></script>
                                                                                                                      <div data-beehiiv-form="YOUR_FORM_ID"></div>
                                                                                                                      </div>
                                                                                                                      ```
                                                                                                                      
                                                                                                                      ---
                                                                                                                      
                                                                                                                      ## VALIDATION CHECKLIST
                                                                                                                      
                                                                                                                      - [ ] Got your Beehiiv Form ID from dashboard
                                                                                                                      - [ ] Replaced all instances of `YOUR_FORM_ID` with actual ID
                                                                                                                      - [ ] Set up 4-email welcome sequence in Beehiiv
                                                                                                                      - [ ] Configured post-subscribe PDF delivery
                                                                                                                      - [ ] Added form code to hero section
                                                                                                                      - [ ] Added form code to footer
                                                                                                                      - [ ] Added form code to contact section
                                                                                                                      - [ ] Committed changes to GitHub
                                                                                                                      - [ ] Deployed to Vercel (usually automatic)
                                                                                                                      - [ ] Tested on live site: filled form and confirmed subscriber in Beehiiv
                                                                                                                      - [ ] Tested lead magnet: received email with PDF link
                                                                                                                      - [ ] Verified all 4 emails show in Beehiiv sequence
                                                                                                                      
                                                                                                                      ---
                                                                                                                      
                                                                                                                      ## EXPECTED RESULTS
                                                                                                                      
                                                                                                                      **Immediately after deployment:**
                                                                                                                      - Forms visible on website (3 locations)
                                                                                                                      - Visitors can subscribe
                                                                                                                      - New subscribers added to Beehiiv
                                                                                                                      
                                                                                                                      **Week 1:**
                                                                                                                      - 5-10 new subscribers (from existing traffic)
                                                                                                                      - Subscribers receiving Email 1 with lead magnet
                                                                                                                      - Confirmation emails showing in Beehiiv dashboard
                                                                                                                      
                                                                                                                      **Week 2-4:**
                                                                                                                      - Subscribers receiving Emails 2-4
                                                                                                                      - First discovery call requests from Email 4 CTA
                                                                                                                      - Beehiiv dashboard showing open rates (target: 35-45%)
                                                                                                                      
                                                                                                                      **Month 1:**
                                                                                                                      - 15-25 new subscribers
                                                                                                                      - 1-3 discovery calls from newsletter
                                                                                                                      - Newsletter showing in Beehiiv metrics
                                                                                                                      
                                                                                                                      ---
                                                                                                                      
                                                                                                                      ## TROUBLESHOOTING
                                                                                                                      
                                                                                                                      **Forms not appearing on website?**
                                                                                                                      - Verify Form ID is correct (no extra spaces or quotes)
                                                                                                                      - Clear browser cache (Ctrl+Shift+Delete)
                                                                                                                      - Check Beehiiv form is published (not draft)
                                                                                                                      - Wait 5 minutes for Vercel to redeploy
                                                                                                                      
                                                                                                                      **Lead magnet not delivering?**
                                                                                                                      - Verify email 1 is set up in Beehiiv automation
                                                                                                                      - Test PDF link works independently
                                                                                                                      - Check spam folder
                                                                                                                      - Verify PDF URL is accessible (not behind login)
                                                                                                                      
                                                                                                                      **Low signup rate?**
                                                                                                                      - Forms are visible but not attracting clicks?
                                                                                                                      - Add more prominent messaging above forms
                                                                                                                      - Test different form styles in Beehiiv
                                                                                                                      - Promote newsletter on social media
                                                                                                                      
                                                                                                                      ---
                                                                                                                      
                                                                                                                      ## NEXT OPTIMIZATION (Wave Integration)
                                                                                                                      
                                                                                                                      After forms are working, connect Beehiiv to Wave:
                                                                                                                      
                                                                                                                      1. Set up Zapier automation
                                                                                                                      2. Beehiiv trigger: New subscriber
                                                                                                                      3. Wave action: Create contact
                                                                                                                      4. Result: All subscribers synced to Wave
                                                                                                                      
                                                                                                                      This allows you to:
                                                                                                                      - See newsletter status in Wave
                                                                                                                      - Track which clients are subscribers
                                                                                                                      - Measure newsletter ROI
                                                                                                                      
                                                                                                                      ---
                                                                                                                      
                                                                                                                      ## FILES INVOLVED
                                                                                                                      
                                                                                                                      - **index.html** - Website (add Beehiiv form code in 3 locations)
                                                                                                                      - **Beehiiv Dashboard** - Set up automation sequence
                                                                                                                      - **Lead Magnet PDF** - Host on Google Drive or server
                                                                                                                      
                                                                                                                      ---
                                                                                                                      
                                                                                                                      ## SUPPORT
                                                                                                                      
                                                                                                                      - Beehiiv Help: https://help.beehiiv.com/
                                                                                                                      - Form embed issues: Check Beehiiv form settings
                                                                                                                      - PDF delivery issues: Verify automation in Beehiiv
                                                                                                                      - Website deployment: Check Vercel for build status
                                                                                                                      
                                                                                                                      **Duration to complete: 30-45 minutes total**
