import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDFKit legge i propri font .afm da node_modules a runtime: va escluso
  // dal bundling server (altrimenti ENOENT in produzione/serverless).
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
