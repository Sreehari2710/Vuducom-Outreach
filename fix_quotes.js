const fs = require('fs');

const files = [
  'frontend/src/components/Templates.tsx',
  'frontend/src/components/ProfileSettings.tsx',
  'frontend/src/components/CampaignWizard.tsx',
  'frontend/src/app/page.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/"(?=\$\{API_BASE_URL\})([^"]+)"/g, '`$1`');
  fs.writeFileSync(file, content);
  console.log('Fixed', file);
});
