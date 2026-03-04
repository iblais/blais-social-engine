export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto py-16 px-4">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <p className="text-muted-foreground mb-4">Last updated: March 4, 2026</p>
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>Blais Social Engine is a personal social media management tool operated by Blais Lab.</p>
        <h2 className="text-lg font-semibold text-foreground mt-6">Data We Collect</h2>
        <p>We collect only the data necessary to operate the service: your email address for authentication, social media account tokens for posting, and content you create within the app.</p>
        <h2 className="text-lg font-semibold text-foreground mt-6">How We Use Your Data</h2>
        <p>Your data is used solely to schedule and publish content to your connected social media accounts. We do not sell, share, or distribute your data to any third parties.</p>
        <h2 className="text-lg font-semibold text-foreground mt-6">Data Storage</h2>
        <p>All data is stored securely on Supabase (PostgreSQL) with row-level security. Access tokens are stored encrypted.</p>
        <h2 className="text-lg font-semibold text-foreground mt-6">Third-Party Services</h2>
        <p>We connect to social media platforms (Instagram, Facebook, TikTok, YouTube, X/Twitter, Pinterest, LinkedIn, Threads, Bluesky) using their official APIs solely to publish your content on your behalf.</p>
        <h2 className="text-lg font-semibold text-foreground mt-6">Contact</h2>
        <p>For privacy questions, contact: itsblais@gmail.com</p>
      </div>
    </div>
  );
}
