import type { MetadataRoute } from 'next';

/** The admin dashboard must never be indexed. Disallow everything. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
