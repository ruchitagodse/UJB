const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../components/profile');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.js')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(dir);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('const userDocId = user?.__docId;')) {
    content = content.replace(/const userDocId = user\?\.__docId;/g, 'const userDocId = user?.__docId || user?.id || user?.UJBCode || user?.ujbCode;');
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
});

console.log('Done!');
