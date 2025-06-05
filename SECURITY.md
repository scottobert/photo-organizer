# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Which versions are eligible for receiving such patches depends on the CVSS v3.0 Rating:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

The photo-organizer team and community take security bugs seriously. We appreciate your efforts to responsibly disclose your findings, and will make every effort to acknowledge your contributions.

To report a security issue, please use one of the following methods:

### Private Disclosure (Preferred)

For sensitive security issues, please email us directly at:
**[scott.obert+security@example.com]** (Replace with your actual email)

Please include the following information in your report:
- Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

### GitHub Security Advisories

You can also report security vulnerabilities through [GitHub Security Advisories](https://github.com/scottobert/photo-organizer/security/advisories/new).

## Response Timeline

We will acknowledge receipt of your vulnerability report within 48 hours and will send a more detailed response within 72 hours indicating the next steps in handling your report.

After the initial reply to your report, we will endeavor to keep you informed of the progress being made towards a fix and full announcement. We may ask for additional information or guidance surrounding the reported issue.

## Disclosure Policy

When we receive a security bug report, we will:

1. Confirm the problem and determine the affected versions
2. Audit code to find any potential similar problems
3. Prepare fixes for all releases still under maintenance
4. Release new versions as soon as possible

## Security Best Practices

When using photo-organizer, please consider the following security best practices:

### File System Security
- Ensure proper file permissions on photo directories
- Be cautious when processing photos from untrusted sources
- Regularly update the application and its dependencies

### Database Security
- Protect the SQLite database file with appropriate file permissions
- Consider encrypting sensitive metadata if stored
- Regularly backup your database

### Dependency Security
- Keep all dependencies up to date
- Monitor security advisories for used packages
- Use `npm audit` to check for known vulnerabilities

## Security Features

This project includes the following security considerations:

- **Input Validation**: All file paths and metadata are validated before processing
- **Safe File Handling**: Files are processed using secure methods to prevent path traversal
- **Dependency Management**: Regular updates and security scanning of dependencies
- **Minimal Permissions**: The application requests only necessary file system permissions

## Known Security Considerations

- **ExifTool Dependency**: This project relies on ExifTool for metadata extraction. Ensure you're using the latest version to avoid known vulnerabilities
- **File Processing**: When processing large numbers of files, ensure adequate system resources to prevent denial of service
- **SQLite Database**: The database stores metadata and file paths - protect access to this file

## Comments on This Policy

If you have suggestions on how this process could be improved, please submit a pull request or create an issue to discuss.

---

This security policy is based on security best practices and will be updated as needed.
