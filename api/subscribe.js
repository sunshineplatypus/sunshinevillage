export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const { email } = req.body || {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'email is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'please enter a valid email' });
    }

    const githubToken = process.env.GITHUB_TOKEN;
    const githubOwner = process.env.GITHUB_OWNER;
    const githubRepo = process.env.GITHUB_REPO;
    const githubPath = process.env.GITHUB_SUBSCRIBERS_PATH || 'data/subscribers.csv';
    const githubBranch = process.env.GITHUB_BRANCH || 'main';

    if (!githubToken || !githubOwner || !githubRepo) {
      return res.status(500).json({ error: 'server is missing github configuration' });
    }

    const apiBase = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${githubPath}`;
    const headers = {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sunshinevillage-subscribe'
    };

    let sha = null;
    let existingContent = 'email,source,subscribed_at\n';

    const getResp = await fetch(`${apiBase}?ref=${encodeURIComponent(githubBranch)}`, {
      headers
    });

    if (getResp.ok) {
      const file = await getResp.json();
      sha = file.sha;
      existingContent = Buffer.from(file.content, 'base64').toString('utf8');
    } else if (getResp.status !== 404) {
      const text = await getResp.text();
      return res.status(500).json({ error: `could not read subscriber list: ${text}` });
    }

    const existingLines = existingContent
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const alreadyExists = existingLines
      .slice(1)
      .some((line) => line.split(',')[0] === cleanEmail);

    if (alreadyExists) {
      return res.status(200).json({ ok: true, message: 'already subscribed' });
    }

    const subscribedAt = new Date().toISOString();
    const newLine = `${cleanEmail},website,${subscribedAt}`;
    const updatedContent = `${existingContent.trimEnd()}\n${newLine}\n`;
    const encodedContent = Buffer.from(updatedContent, 'utf8').toString('base64');

    const body = {
      message: `add subscriber ${cleanEmail}`,
      content: encodedContent,
      branch: githubBranch
    };

    if (sha) {
      body.sha = sha;
    }

    const putResp = await fetch(apiBase, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!putResp.ok) {
      const text = await putResp.text();
      return res.status(500).json({ error: `could not save subscriber: ${text}` });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'server error' });
  }
}
