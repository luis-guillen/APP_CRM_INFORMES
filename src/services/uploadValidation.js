const fs = require('fs');
const path = require('path');

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

const SIGNATURES = {
    pdf: Buffer.from('%PDF-'),
    jpg: Buffer.from([0xff, 0xd8, 0xff]),
    png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    gif87a: Buffer.from('GIF87a'),
    gif89a: Buffer.from('GIF89a'),
    zip: Buffer.from([0x50, 0x4b]),
    ole: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
};

const FILE_RULES = {
    fotografias: {
        jpg: { mimes: ['image/jpeg'], signatures: ['jpg'] },
        jpeg: { mimes: ['image/jpeg'], signatures: ['jpg'] },
        png: { mimes: ['image/png'], signatures: ['png'] },
        gif: { mimes: ['image/gif'], signatures: ['gif87a', 'gif89a'] }
    },
    documentos: {
        pdf: { mimes: ['application/pdf'], signatures: ['pdf'] },
        doc: { mimes: ['application/msword'], signatures: ['ole'] },
        xls: { mimes: ['application/vnd.ms-excel'], signatures: ['ole'] },
        ppt: { mimes: ['application/vnd.ms-powerpoint'], signatures: ['ole'] },
        docx: {
            mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            signatures: ['zip']
        },
        xlsx: {
            mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
            signatures: ['zip']
        },
        pptx: {
            mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
            signatures: ['zip']
        }
    }
};

function detectSignature(headerBuffer) {
    if (headerBuffer.slice(0, SIGNATURES.pdf.length).equals(SIGNATURES.pdf)) {
        return 'pdf';
    }
    if (headerBuffer.slice(0, SIGNATURES.jpg.length).equals(SIGNATURES.jpg)) {
        return 'jpg';
    }
    if (headerBuffer.slice(0, SIGNATURES.png.length).equals(SIGNATURES.png)) {
        return 'png';
    }
    if (
        headerBuffer.slice(0, SIGNATURES.gif87a.length).equals(SIGNATURES.gif87a)
        || headerBuffer.slice(0, SIGNATURES.gif89a.length).equals(SIGNATURES.gif89a)
    ) {
        return 'gif89a';
    }
    if (headerBuffer.slice(0, SIGNATURES.ole.length).equals(SIGNATURES.ole)) {
        return 'ole';
    }
    if (headerBuffer.slice(0, SIGNATURES.zip.length).equals(SIGNATURES.zip)) {
        return 'zip';
    }
    return null;
}

function readFileHeader(filePath, bytes = 16) {
    const fd = fs.openSync(filePath, 'r');
    try {
        const buffer = Buffer.alloc(bytes);
        const readBytes = fs.readSync(fd, buffer, 0, bytes, 0);
        return buffer.slice(0, readBytes);
    } finally {
        fs.closeSync(fd);
    }
}

function validateFileByRules(file, fieldName) {
    const fieldRules = FILE_RULES[fieldName];
    if (!fieldRules) {
        return { valid: false, reason: 'Campo de adjunto no permitido' };
    }

    if (!file || !file.path || !fs.existsSync(file.path)) {
        return { valid: false, reason: 'Archivo no disponible en disco' };
    }

    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_UPLOAD_SIZE_BYTES) {
        return { valid: false, reason: 'Tamaño de archivo no permitido' };
    }

    const extension = path.extname(file.originalname || '').toLowerCase().replace('.', '');
    if (!extension || !Object.prototype.hasOwnProperty.call(fieldRules, extension)) {
        return { valid: false, reason: 'Extensión de archivo no permitida' };
    }

    const rule = fieldRules[extension];
    if (!rule.mimes.includes((file.mimetype || '').toLowerCase())) {
        return { valid: false, reason: 'MIME de archivo no permitido' };
    }

    const header = readFileHeader(file.path, 16);
    const signature = detectSignature(header);

    if (!signature || !rule.signatures.includes(signature)) {
        return { valid: false, reason: 'Firma/binario del archivo no coincide con el tipo permitido' };
    }

    return { valid: true };
}

function cleanupUploadedFiles(uploadedFiles) {
    for (const file of uploadedFiles) {
        if (file?.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
    }
}

function flattenUploadedFiles(filesByField = {}) {
    return Object.values(filesByField).flat();
}

function validateUploadedFiles(filesByField = {}) {
    const flatFiles = flattenUploadedFiles(filesByField);

    for (const [fieldName, files] of Object.entries(filesByField)) {
        for (const file of files) {
            const validation = validateFileByRules(file, fieldName);
            if (!validation.valid) {
                cleanupUploadedFiles(flatFiles);
                return {
                    valid: false,
                    reason: validation.reason
                };
            }
        }
    }

    return { valid: true };
}

module.exports = {
    MAX_UPLOAD_SIZE_BYTES,
    FILE_RULES,
    detectSignature,
    validateFileByRules,
    validateUploadedFiles,
    cleanupUploadedFiles,
    flattenUploadedFiles
};
