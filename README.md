# Qwen Cloud AutoSignup (Tor Browser)

Browser extension for Tor Browser that auto-fills the Qwen Cloud signup form with randomized email addresses and **automatically fetches OTP codes** from TestMail.

## Features

- ✅ Auto-detects and fills signup forms on qwen.ai
- ✅ Generates random email addresses using TestMail format (`{namespace}.{tag}@inbox.testmail.app`)
- ✅ **Auto-fetches verification codes** from TestMail API
- ✅ Multiple OTP extraction patterns (supports 4-8 digit codes)
- ✅ Automatic fallback: namespace-wide search if tag filter fails
- ✅ Copies code to clipboard AND auto-fills the form
- ✅ Optional auto-submit after filling
- ✅ Manual verification code entry fallback
- ✅ Dark theme UI optimized for privacy-focused users

## Prerequisites

1. **TestMail Account**: Sign up at [testmail.app](https://testmail.app)
2. **API Key**: Get your API key from the TestMail dashboard
3. **Namespace**: Use your assigned namespace (e.g., `gti43`) or create a custom one

## Installation for Tor Browser

1. Open Tor Browser and navigate to `about:config`
2. Set `xpinstall.signatures.required` to `false` (if needed for your version)
3. Go to `about:addons` → Extensions
4. Click the gear icon ⚙️ → "Debug Add-ons"
5. Click "Load Temporary Add-on" and select the `manifest.json` file from this extension

> **Note**: This is a temporary installation. You'll need to reload it each time you restart Tor Browser. For permanent installation, package as `.xpi`.

## Usage

### Initial Setup
1. Click the extension icon in Tor Browser toolbar
2. Enter your **TestMail namespace** (e.g., `gti43`)
3. Enter a **tag prefix** (random suffix auto-added, e.g., `qwen` → `qwen7x2k9m`)
4. Enter your **TestMail API key** (from testmail.app dashboard)
5. Optionally set a **password** to reuse across signups
6. Check **"Auto-fill"** and **"Auto-submit"** if desired
7. Click **"Save settings"**

### Signup Flow
1. Navigate to `https://qwen.ai` signup page
2. **Auto-fill mode**: Extension detects the form and fills automatically (if enabled)
   - OR click **"🎲 Fill form"** to manually trigger
3. Complete any CAPTCHA if present
4. Submit the form (auto or manual)
5. Wait for the verification email (~5-30 seconds)
6. Click **"📩 Fetch verification code"**
   - Extension polls TestMail API (up to 5 attempts, 3s intervals)
   - Extracts OTP from email subject/body
   - Auto-fills the code into the form
   - Copies code to clipboard as backup
7. Submit verification (auto or manual)

### Manual Fallback
If auto-fetch fails:
1. Open TestMail dashboard at `https://app.testmail.app`
2. Find the verification email
3. Copy the code
4. Paste into the **"Code (manual fallback)"** field
5. Click **"Fill"**

## How OTP Fetching Works

```javascript
1. Generate unique email: gti43.qwen7x2k9m@inbox.testmail.app
2. Fill form + submit
3. Poll TestMail API with:
   - API key
   - Namespace
   - Tag (for filtering)
4. Search emails for:
   - Recipient matching our generated email, OR
   - Subject/from containing "qwen", "verification", "signup"
5. Extract code using regex patterns:
   - "verification code: 123456"
   - "OTP: 123456"
   - "Your code is 123456"
   - "验证码 123456" (Chinese)
   - Any 6-digit number
   - Fallback: any 4-8 digit number
6. Auto-fill + copy to clipboard
```

## API Endpoints Used

- **TestMail JSON API**: `https://api.testmail.app/api/json`
  - Query params: `apikey`, `namespace`, `tag`
  - Returns: `{ emails: [...] }`

## Troubleshooting

### "No email yet" message
- Wait 10-30 seconds after submitting the form
- Check if the form was actually submitted
- Verify email was generated (shown in popup)
- Try clicking "Fetch verification code" again

### "API Error" or "Fetch failed"
- Verify your API key is correct (copy from TestMail dashboard)
- Check network connectivity (Tor circuit may be slow)
- Ensure namespace is valid

### "Email found but no code detected"
- The regex didn't match the email format
- Manually check the email in TestMail dashboard
- Use the manual code entry fallback

### Form not auto-filling
- Ensure you're on a qwen.ai signup page (not login)
- Check "Auto-fill" setting is enabled
- Try manual "Fill form" button

## Notes for Tor Browser

- ✅ Uses **Manifest V2** for Tor Browser compatibility
- ✅ Uses `browser.*` APIs (WebExtensions standard)
- ✅ Minimal permissions: `activeTab`, `storage`
- ✅ No persistent background scripts
- ✅ Respects Tor Browser privacy settings
- ⚠️ TestMail API calls go over Tor (may be slower)

## File Structure

```
├── manifest.json    # Extension manifest (MV2)
├── popup.html       # Extension popup UI
├── popup.js         # Popup logic + TestMail API integration
├── content.js       # Content script for form filling
└── README.md        # This file
```

## Security Considerations

- API key stored locally in browser storage (encrypted by Tor Browser)
- No data sent to third parties except TestMail API
- Email addresses are temporary and disposable
- Codes are cleared when popup closes

## License

MIT License - Feel free to modify and distribute.