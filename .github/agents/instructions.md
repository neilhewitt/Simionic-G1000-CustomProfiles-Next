# Instructions for Copilot when working in this repo

1. Remember that this app is always going to be low-traffic and single instance. It will have at most a few hundred regular users, and at most a few tens of concurrent sessions. Design and respond accordingly.
2. Don't let that stop you from following security best practices. Any site might be targeted for exploitation. The site should not fall over or become insecure if hit with a sudden spike in traffic.
3. Prefer solutions that use the default configurations of Node, MongoDB etc. Assume that it will be a vanilla deployment environment and that costly hosting options are not practical.
4. Our users are not technical. The site performs some quite technical functions. Prefer explanatory text over text that assumes users know what they're doing technically.
5. Focus on usability.
