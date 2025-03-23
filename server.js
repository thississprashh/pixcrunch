const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

const app = express();

// Adjust paths to point to the parent directory
const uploadDir = path.join(__dirname, '..', 'uploads');
const compressedDir = path.join(__dirname, '..', 'compressed');
const publicDir = path.join(__dirname, '..', 'public');

// Ensure directories exist
const ensureDir = async (dir) => {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (err) {
        console.error(`Error creating directory ${dir}:`, err);
    }
};

Promise.all([
    ensureDir(uploadDir),
    ensureDir(compressedDir)
]).then(() => console.log('Directories ensured'));

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

app.use(express.static(publicDir));
app.use('/compressed', express.static(compressedDir));

app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.post('/preview', upload.array('images'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            console.error('No files uploaded for preview');
            return res.status(400).json({ error: 'No files uploaded for preview' });
        }

        console.log(`Received ${req.files.length} files for preview:`, req.files.map(file => file.originalname));

        const quality = parseInt(req.body.quality) || 50;
        const format = req.body.format || 'jpeg'; // Default to JPEG
        console.log(`Previewing with quality: ${quality}, format: ${format}`);

        const file = req.files[0];
        const previewFileName = `preview_${Date.now()}.${format}`;
        const previewPath = path.join(compressedDir, previewFileName);

        console.log(`Generating preview for ${file.originalname} as ${previewFileName}`);

        const sharpInstance = sharp(file.path);
        if (format === 'jpeg') {
            sharpInstance.jpeg({ quality: quality });
        } else if (format === 'png') {
            sharpInstance.png({ quality: quality });
        } else if (format === 'webp') {
            sharpInstance.webp({ quality: quality });
        }

        await sharpInstance.toFile(previewPath);

        const stats = await fs.stat(previewPath);
        const previewImage = {
            compressedName: previewFileName,
            compressedPath: `/compressed/${previewFileName}`,
            compressedSize: stats.size,
            format: format
        };

        console.log(`Preview generated: ${previewFileName}, size: ${stats.size} bytes`);

        await fs.unlink(file.path).catch(err => console.error(`Error deleting ${file.path}:`, err));

        res.json({ previewImage });
    } catch (error) {
        console.error('Preview error:', error);
        res.status(500).json({ error: 'Preview failed' });
    }
});

app.post('/compress', upload.array('images'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            console.error('No files uploaded');
            return res.status(400).json({ error: 'No files uploaded' });
        }

        console.log(`Received ${req.files.length} files:`, req.files.map(file => file.originalname));

        const quality = parseInt(req.body.quality) || 50;
        const format = req.body.format || 'jpeg'; // Default to JPEG
        console.log(`Using compression quality: ${quality}, format: ${format}`);

        const compressedImages = [];
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const compressedFileName = `compressed_${Date.now()}_${i}.${format}`;
            const compressedPath = path.join(compressedDir, compressedFileName);

            console.log(`Compressing ${file.originalname} to ${compressedFileName} with quality ${quality}`);

            const sharpInstance = sharp(file.path);
            if (format === 'jpeg') {
                sharpInstance.jpeg({ quality: quality });
            } else if (format === 'png') {
                sharpInstance.png({ quality: quality });
            } else if (format === 'webp') {
                sharpInstance.webp({ quality: quality });
            }

            await sharpInstance.toFile(compressedPath);

            const stats = await fs.stat(compressedPath);
            compressedImages.push({
                originalName: file.originalname,
                compressedName: compressedFileName,
                compressedPath: `/compressed/${compressedFileName}`,
                compressedSize: stats.size,
                format: format
            });

            console.log(`Compressed ${file.originalname}: ${stats.size} bytes`);

            await fs.unlink(file.path).catch(err => console.error(`Error deleting ${file.path}:`, err));
        }

        console.log('Sending response with compressed images:', compressedImages);
        res.json({ compressedImages });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Compression failed' });
    }
});

// Clean up compressed files periodically
setInterval(async () => {
    try {
        const files = await fs.readdir(compressedDir);
        const now = Date.now();
        for (const file of files) {
            const filePath = path.join(compressedDir, file);
            const stats = await fs.stat(filePath);
            if (now - stats.mtimeMs > 1000 * 60 * 60) {
                await fs.unlink(filePath);
                console.log(`Deleted old file: ${file}`);
            }
        }
    } catch (err) {
        console.error('Error cleaning up compressed files:', err);
    }
}, 1000 * 60 * 60);

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});