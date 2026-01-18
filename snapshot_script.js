const fs = require('fs');
const path = require('path');

const outputFile = 'code_snapshot.md';
const projectRoot = process.cwd();

const excludeDirs = ['node_modules', '.next', '.git', '.vscode', 'dist', 'build', 'coverage', '.gemini', 'tmp'];
const excludeFiles = ['code_snapshot.md', 'code_snapshot_temp.md', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'next-env.d.ts', '.DS_Store', 'Thumbs.db', 'snapshot_script.js', 'snapshot_script.ps1'];
const includeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.py', '.sql', '.css', '.html', '.dockerfile', '.yml', '.yaml'];

function isExcluded(filePath) {
    const relativePath = path.relative(projectRoot, filePath);
    const parts = relativePath.split(path.sep);

    // Check directories
    for (const part of parts) {
        if (excludeDirs.includes(part)) {
            return true;
        }
    }

    const fileName = path.basename(filePath);
    // Check files
    if (excludeFiles.includes(fileName)) return true;

    return false;
}

function shouldInclude(filePath) {
    const fileName = path.basename(filePath);
    if (fileName === 'Dockerfile') return true; // Explicitly include Dockerfile (no extension)

    const ext = path.extname(filePath).toLowerCase();
    return includeExtensions.includes(ext);
}

function getAllFiles(dirPath, arrayOfFiles) {
    let files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        const fullPath = path.join(dirPath, file);
        try {
            if (fs.statSync(fullPath).isDirectory()) {
                if (!excludeDirs.includes(file)) {
                    arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
                }
            } else {
                if (!isExcluded(fullPath) && shouldInclude(fullPath)) {
                    arrayOfFiles.push(fullPath);
                }
            }
        } catch (e) {
            console.warn(`Skipping ${fullPath}: ${e.message}`);
        }
    });

    return arrayOfFiles;
}

const files = getAllFiles(projectRoot);
let output = `# Code Snapshot\nGenerated on ${new Date().toISOString()}\n\n`;

// Sort files for consistent output
files.sort();

files.forEach(file => {
    const relativePath = path.relative(projectRoot, file);
    console.log(`Processing: ${relativePath}`);

    let ext = path.extname(file).replace('.', '') || 'txt';
    if (path.basename(file) === 'Dockerfile') ext = 'dockerfile';

    try {
        const content = fs.readFileSync(file, 'utf8');
        output += `## File: ${relativePath}\n`;
        output += `\`\`\`${ext}\n`;
        output += content + '\n';
        output += `\`\`\`\n\n`;
    } catch (err) {
        console.error(`Error reading ${file}: ${err.message}`);
    }
});

fs.writeFileSync(outputFile, output);
console.log(`Snapshot created: ${outputFile} with ${files.length} files.`);
