import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DIST_DIR = path.resolve('dist');
const INDEX_PATH = path.join(DIST_DIR, 'index.html');
const PREVIEW_IMAGE_URL = 'https://www.patch.app/patch-whatsapp-preview-v2.jpg';

const routes = [
  {
    path: 'meeting',
    title: 'Patch Meeting',
    description: 'Your Patch meeting link.',
  },
  {
    path: 'pre',
    title: 'Patch Pre-Masterclass',
    description: 'Prepare for your Patch pre-masterclass session.',
  },
  {
    path: 'masterclass',
    title: 'Patch Masterclass',
    description: 'Your Patch masterclass session link.',
  },
  {
    path: 'activity',
    title: 'Patch LinkedIn Activity',
    description: 'Your Patch LinkedIn activity link.',
  },
  {
    path: 'kc',
    title: 'Know Your Coach',
    description: 'Meet your Patch coach before your session.',
  },
  {
    path: 'certified',
    title: 'Patch Certificate',
    description: 'Your Patch certificate link.',
  },
  {
    path: 'reactivate',
    title: 'Reactivate Patch',
    description: 'Restart your Patch coaching sessions.',
  },
  {
    path: 'cancel',
    title: 'Cancel Patch',
    description: 'Manage or cancel your Patch sessions.',
  },
  {
    path: 'legal',
    title: 'Legal | Patch',
    description: 'Legal information for Patch, including privacy, terms, and account deletion.',
  },
];

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function createMetaBlock(route) {
  const title = escapeHtml(route.title);
  const description = escapeHtml(route.description);
  const url = `https://www.patch.app/${route.path}`;

  return `    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Patch" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${PREVIEW_IMAGE_URL}" />
    <meta property="og:image:secure_url" content="${PREVIEW_IMAGE_URL}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="640" />
    <meta property="og:image:height" content="641" />
    <meta property="og:image:alt" content="Patch preview image" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${PREVIEW_IMAGE_URL}" />
    <link rel="image_src" href="${PREVIEW_IMAGE_URL}" />`;
}

function removeExistingMeta(headContent) {
  return headContent.replace(
    /\s*(<title>[\s\S]*?<\/title>|<meta\b[\s\S]*?\/>|<link\b[\s\S]*?\/>)/gi,
    (match, tag) => {
      if (
        /^<title>/i.test(tag) ||
        /\bname="description"/.test(tag) ||
        /\bproperty="og:[^"]+"/.test(tag) ||
        /\bname="twitter:[^"]+"/.test(tag) ||
        (/\brel="image_src"/.test(tag) && /^<link\b/i.test(tag))
      ) {
        return '';
      }

      return match;
    },
  );
}

function createRouteHtml(html, route) {
  const headMatch = html.match(/<head>([\s\S]*?)<\/head>/);

  if (!headMatch) {
    throw new Error('Could not find <head> in dist/index.html');
  }

  const headContent = headMatch[1];
  const cleanHead = removeExistingMeta(headContent);
  const viewportTag =
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />';
  const metaBlock = createMetaBlock(route);

  let nextHead;
  if (cleanHead.includes(viewportTag)) {
    nextHead = cleanHead.replace(viewportTag, `${viewportTag}\n${metaBlock}`);
  } else {
    nextHead = `\n${metaBlock}${cleanHead}`;
  }

  return html.replace(headMatch[0], `<head>${nextHead}</head>`);
}

const indexHtml = await readFile(INDEX_PATH, 'utf8');

await Promise.all(
  routes.map(async (route) => {
    const outputDir = path.join(DIST_DIR, route.path);
    const outputPath = path.join(outputDir, 'index.html');
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, createRouteHtml(indexHtml, route));
  }),
);

console.log(`Created ${routes.length} route metadata pages.`);
