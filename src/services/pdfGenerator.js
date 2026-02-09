const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generador de informes PDF para Reker Tech Solutions
 * Formato exacto al documento base
 */
class PDFGenerator {
    constructor() {
        this.margins = { top: 60, bottom: 60, left: 60, right: 60 };
        this.colors = {
            primary: '#1a365d',      // Azul oscuro corporativo
            secondary: '#2c5282',    // Azul medio
            accent: '#3182ce',       // Azul claro
            text: '#1a202c',         // Negro
            lightGray: '#e2e8f0',    // Gris claro para tablas
            white: '#ffffff'
        };
    }

    /**
     * Genera el informe PDF completo
     * @param {Object} data - Datos de la reunión
     * @param {string} outputPath - Ruta de salida del PDF
     * @returns {Promise<string>} - Ruta del archivo generado
     */
    async generate(data, outputPath) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margins: this.margins,
                    bufferPages: true,
                    info: {
                        Title: `Informe de Reunión - ${data.cliente.empresa}`,
                        Author: 'Reker Tech Solutions',
                        Subject: 'Informe de Reunión y Definición de Necesidades',
                        Keywords: 'reunión, ingeniería, automatización'
                    }
                });

                const stream = fs.createWriteStream(outputPath);
                doc.pipe(stream);

                // Generar contenido
                this.addCoverPage(doc, data);
                this.addTableOfContents(doc);
                this.addSection1_FichaCliente(doc, data.cliente);
                this.addSection2_DatosReunion(doc, data);
                this.addSection3_ResumenEjecutivo(doc, data.resumen_ejecutivo);
                this.addSection4_NecesidadCliente(doc, data.necesidad_cliente);
                this.addSection5_SituacionActual(doc, data.situacion_actual);
                this.addAnexos(doc, data.anexos);
                this.addFooter(doc, data);

                doc.end();

                stream.on('finish', () => resolve(outputPath));
                stream.on('error', reject);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Añade la portada del documento
     */
    addCoverPage(doc, data) {
        const pageWidth = doc.page.width - this.margins.left - this.margins.right;

        // Título principal
        doc.fontSize(28)
            .fillColor(this.colors.primary)
            .font('Helvetica-Bold')
            .text('Reker Tech Solutions', this.margins.left, 100, { width: pageWidth, align: 'center' });

        doc.fontSize(14)
            .fillColor(this.colors.secondary)
            .font('Helvetica')
            .text('Ingeniería Industrial y Automatización', { width: pageWidth, align: 'center' });

        // Línea decorativa
        doc.moveTo(this.margins.left + 100, 170)
            .lineTo(doc.page.width - this.margins.right - 100, 170)
            .strokeColor(this.colors.accent)
            .lineWidth(2)
            .stroke();

        // Título del documento
        doc.fontSize(22)
            .fillColor(this.colors.primary)
            .font('Helvetica-Bold')
            .text('Informe de Reunión y', this.margins.left, 220, { width: pageWidth, align: 'center' })
            .text('Definición de Necesidades', { width: pageWidth, align: 'center' });

        doc.moveDown(0.5);
        doc.fontSize(12)
            .fillColor(this.colors.secondary)
            .font('Helvetica')
            .text('Documento Comercial-Técnico', { width: pageWidth, align: 'center' });

        // Datos del documento
        const yPos = 350;
        const labelWidth = 180;

        this.addLabelValue(doc, 'Autor del documento:', data.autor_documento || '[Responsable]', yPos, labelWidth);
        this.addLabelValue(doc, 'Cliente:', data.cliente.empresa, yPos + 30, labelWidth);
        this.addLabelValue(doc, 'Código / Referencia Interna:', data.codigo_referencia, yPos + 60, labelWidth);
        this.addLabelValue(doc, 'Fecha de Reunión:', this.formatDate(data.fecha_hora), yPos + 90, labelWidth);
        this.addLabelValue(doc, 'Fecha del Documento:', this.formatDate(new Date()), yPos + 120, labelWidth);

        // Pie de portada
        doc.fontSize(10)
            .fillColor(this.colors.secondary)
            .text('Ingeniería Industrial y Automatización', this.margins.left, doc.page.height - 100, { width: pageWidth, align: 'center' });

        doc.addPage();
    }

    /**
     * Añade el índice
     */
    addTableOfContents(doc) {
        const pageWidth = doc.page.width - this.margins.left - this.margins.right;

        doc.fontSize(18)
            .fillColor(this.colors.primary)
            .font('Helvetica-Bold')
            .text('Índice', this.margins.left, this.margins.top);

        doc.moveDown(1.5);

        const items = [
            { num: '1', title: 'Ficha del Cliente', page: '3' },
            { num: '2', title: 'Datos de la Reunión', page: '3' },
            { num: '3', title: 'Resumen Ejecutivo', page: '3' },
            { num: '4', title: 'Necesidad Principal del Cliente', page: '3' },
            { num: '5', title: 'Situación Actual', page: '4' },
            { num: 'A', title: 'Anexos', page: '4' },
            { num: 'A.1', title: 'Documentación Recibida del Cliente', page: '4', indent: true },
            { num: 'A.2', title: 'Fotografías de la Reunión', page: '4', indent: true },
            { num: 'A.3', title: 'Notas Adicionales', page: '4', indent: true }
        ];

        for (const item of items) {
            const indent = item.indent ? 20 : 0;
            doc.fontSize(11)
                .fillColor(this.colors.text)
                .font('Helvetica')
                .text(`${item.num}. ${item.title}`, this.margins.left + indent, doc.y, { continued: true })
                .text(item.page, { align: 'right' });
            doc.moveDown(0.5);
        }

        doc.addPage();
    }

    /**
     * Sección 1: Ficha del Cliente
     */
    addSection1_FichaCliente(doc, cliente) {
        this.addSectionHeader(doc, '1. Ficha del Cliente');

        const tableData = [
            ['Campo', 'Información'],
            ['Empresa', cliente.empresa || ''],
            ['Persona de Contacto', cliente.persona_contacto || ''],
            ['Cargo', cliente.cargo || ''],
            ['Teléfono / Email', `${cliente.telefono || ''} / ${cliente.email || ''}`],
            ['Ubicación', cliente.ubicacion || ''],
            ['Actividad Principal', cliente.actividad_principal || '']
        ];

        this.addTable(doc, tableData);
        doc.moveDown(1.5);
    }

    /**
     * Sección 2: Datos de la Reunión
     */
    addSection2_DatosReunion(doc, data) {
        this.addSectionHeader(doc, '2. Datos de la Reunión');

        // Formatear asistentes
        const asistentesCliente = (data.asistentes || [])
            .filter(a => a.tipo === 'cliente')
            .map(a => `${a.nombre}${a.cargo ? ' (' + a.cargo + ')' : ''}`)
            .join(', ') || 'No especificado';

        const asistentesReker = (data.asistentes || [])
            .filter(a => a.tipo === 'reker')
            .map(a => `${a.nombre}${a.cargo ? ' (' + a.cargo + ')' : ''}`)
            .join(', ') || 'No especificado';

        const tableData = [
            ['Campo', 'Información'],
            ['Fecha y Hora', this.formatDateTime(data.fecha_hora)],
            ['Lugar', data.lugar || ''],
            ['Asistentes', `Por parte del Cliente: ${asistentesCliente}\nPor nuestra parte: ${asistentesReker}`],
            ['Motivo de la Reunión', data.motivo || '']
        ];

        this.addTable(doc, tableData);
        doc.moveDown(1.5);
    }

    /**
     * Sección 3: Resumen Ejecutivo
     */
    addSection3_ResumenEjecutivo(doc, resumen) {
        this.addSectionHeader(doc, '3. Resumen Ejecutivo');

        doc.fontSize(10)
            .fillColor(this.colors.secondary)
            .font('Helvetica-Bold')
            .text('Síntesis de la Reunión (5-6 líneas máximo)');

        doc.moveDown(0.5);

        const box = {
            x: this.margins.left,
            y: doc.y,
            width: doc.page.width - this.margins.left - this.margins.right,
            height: 100
        };

        doc.rect(box.x, box.y, box.width, box.height)
            .strokeColor(this.colors.lightGray)
            .stroke();

        doc.fontSize(10)
            .fillColor(this.colors.text)
            .font('Helvetica')
            .text(resumen?.sintesis || '[Resumir la esencia de la reunión. ¿Cuál es el contexto? ¿Qué quiere el cliente? ¿Cuál es la conclusión principal o el siguiente paso acordado?]',
                box.x + 10, box.y + 10, { width: box.width - 20 });

        doc.y = box.y + box.height + 20;
        doc.moveDown(1);
    }

    /**
     * Sección 4: Necesidad Principal del Cliente
     */
    addSection4_NecesidadCliente(doc, necesidad) {
        this.addSectionHeader(doc, '4. Necesidad Principal del Cliente');

        const tableData = [
            ['Aspecto', 'Descripción'],
            ['¿Qué solicita explícitamente?', necesidad?.solicitud_explicita || '[Transcribir la petición del cliente usando sus propias palabras]'],
            ['¿Qué objetivo de negocio persigue?', necesidad?.objetivo_negocio || '[Traducir a objetivo de negocio: aumentar producción, reducir costes, cumplir legislación]']
        ];

        this.addTable(doc, tableData);
        doc.moveDown(1.5);
    }

    /**
     * Sección 5: Situación Actual
     */
    addSection5_SituacionActual(doc, situacion) {
        // Verificar si necesitamos nueva página
        if (doc.y > doc.page.height - 250) {
            doc.addPage();
        }

        this.addSectionHeader(doc, '5. Situación Actual');

        const tableData = [
            ['Aspecto', 'Descripción'],
            ['¿Cómo funciona el proceso ahora?', situacion?.proceso_actual || '[Describir estado actual. ¿Es manual? ¿Quién lo hace? ¿Cuáles son los pasos?]'],
            ['¿Qué equipos tiene instalados?', situacion?.equipos_instalados || '[Listar equipamiento, marcas, modelos, antigüedad]'],
            ['Limitaciones y problemas', situacion?.limitaciones_problemas || '[Detallar ineficiencias o problemas mencionados]']
        ];

        this.addTable(doc, tableData);
        doc.moveDown(1.5);
    }

    /**
     * Anexos - Solo se añade si hay contenido
     */
    addAnexos(doc, anexos) {
        // Solo crear página de anexos si hay algún anexo
        const documentos = (anexos || []).filter(a => a.tipo === 'documento');
        const fotografias = (anexos || []).filter(a => a.tipo === 'fotografia');
        const notas = (anexos || []).filter(a => a.tipo === 'nota');

        if (documentos.length === 0 && fotografias.length === 0 && notas.length === 0) {
            return; // No crear página si no hay anexos
        }

        doc.addPage();

        this.addSectionHeader(doc, 'A. Anexos');

        doc.fontSize(10)
            .fillColor(this.colors.text)
            .font('Helvetica')
            .text('En este anexo se recogen los documentos y material gráfico de apoyo relacionado con el cliente y la reunión.');

        doc.moveDown(1);

        // A.1 Documentación Recibida
        doc.fontSize(12)
            .fillColor(this.colors.primary)
            .font('Helvetica-Bold')
            .text('A.1. Documentación Recibida del Cliente');
        doc.moveDown(0.5);

        if (documentos.length > 0) {
            for (const doc_anexo of documentos) {
                doc.fontSize(10)
                    .fillColor(this.colors.text)
                    .font('Helvetica')
                    .text(`• ${doc_anexo.nombre_archivo}${doc_anexo.descripcion ? ': ' + doc_anexo.descripcion : ''}`);
            }
        } else {
            doc.fontSize(10)
                .fillColor(this.colors.text)
                .font('Helvetica-Oblique')
                .text('[Sin documentación adjunta]');
        }

        doc.moveDown(1);

        // A.2 Fotografías
        doc.fontSize(12)
            .fillColor(this.colors.primary)
            .font('Helvetica-Bold')
            .text('A.2. Fotografías de la Reunión');
        doc.moveDown(0.5);

        if (fotografias.length > 0) {
            doc.fontSize(10)
                .fillColor(this.colors.text)
                .font('Helvetica')
                .text('Fotografías tomadas durante la visita o reunión con el cliente:');
            doc.moveDown(0.5);

            // Intentar incluir las imágenes
            let xPos = this.margins.left;
            let yPos = doc.y;
            const imgWidth = 150;
            const imgHeight = 100;

            for (let i = 0; i < fotografias.length && i < 6; i++) {
                try {
                    if (fs.existsSync(fotografias[i].ruta_archivo)) {
                        doc.image(fotografias[i].ruta_archivo, xPos, yPos, { width: imgWidth, height: imgHeight, fit: [imgWidth, imgHeight] });
                        xPos += imgWidth + 20;
                        if ((i + 1) % 3 === 0) {
                            xPos = this.margins.left;
                            yPos += imgHeight + 20;
                        }
                    }
                } catch (e) {
                    // Si falla la imagen, solo listar
                    doc.text(`• ${fotografias[i].nombre_archivo}`);
                }
            }
            doc.y = yPos + imgHeight + 30;
        } else {
            doc.fontSize(10)
                .fillColor(this.colors.text)
                .font('Helvetica-Oblique')
                .text('[Sin fotografías adjuntas]');
        }

        doc.moveDown(1);

        // A.3 Notas Adicionales
        doc.fontSize(12)
            .fillColor(this.colors.primary)
            .font('Helvetica-Bold')
            .text('A.3. Notas Adicionales');
        doc.moveDown(0.5);

        if (notas.length > 0) {
            for (const nota of notas) {
                doc.fontSize(10)
                    .fillColor(this.colors.text)
                    .font('Helvetica')
                    .text(`• ${nota.descripcion}`);
            }
        } else {
            doc.fontSize(10)
                .fillColor(this.colors.text)
                .font('Helvetica-Oblique')
                .text('[Sin notas adicionales]');
        }
    }

    /**
     * Añade el pie de página con información de confidencialidad
     */
    addFooter(doc, data) {
        const pageCount = doc.bufferedPageRange().count;
        const pages = doc.bufferedPageRange();

        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);

            // Número de página (excepto portada)
            if (i > 0) {
                doc.fontSize(8)
                    .fillColor(this.colors.secondary)
                    .text(
                        `Ingeniería Industrial y Automatización`,
                        this.margins.left,
                        doc.page.height - 40,
                        { width: 200, align: 'left' }
                    )
                    .text(
                        `${i}`,
                        doc.page.width / 2 - 10,
                        doc.page.height - 40,
                        { width: 20, align: 'center' }
                    )
                    .text(
                        `Documento Comercial-Técnico`,
                        doc.page.width - this.margins.right - 200,
                        doc.page.height - 40,
                        { width: 200, align: 'right' }
                    );
            }
        }

        // Última página - Aviso de confidencialidad
        doc.switchToPage(pageCount - 1);
        const pageWidth = doc.page.width - this.margins.left - this.margins.right;

        doc.moveDown(3);
        doc.fontSize(9)
            .fillColor(this.colors.secondary)
            .font('Helvetica-Bold')
            .text(`Documento Confidencial © ${new Date().getFullYear()} Reker Tech Solutions`, this.margins.left, doc.page.height - 80, { width: pageWidth, align: 'center' });

        doc.fontSize(8)
            .font('Helvetica')
            .text('Este documento es para uso interno y preparación de oferta para el cliente mencionado.', { width: pageWidth, align: 'center' })
            .text('No debe ser distribuido sin autorización.', { width: pageWidth, align: 'center' });
    }

    // === UTILIDADES ===

    addSectionHeader(doc, title) {
        doc.fontSize(14)
            .fillColor(this.colors.primary)
            .font('Helvetica-Bold')
            .text(title);
        doc.moveDown(0.5);
    }

    addLabelValue(doc, label, value, y, labelWidth) {
        doc.fontSize(11)
            .fillColor(this.colors.text)
            .font('Helvetica-Bold')
            .text(label, this.margins.left, y, { continued: false });

        doc.fontSize(11)
            .font('Helvetica')
            .text(value || '', this.margins.left + labelWidth, y);
    }

    addTable(doc, data) {
        const startX = this.margins.left;
        let startY = doc.y;
        const colWidths = [150, doc.page.width - this.margins.left - this.margins.right - 150];
        const rowHeight = 25;
        const padding = 8;

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const isHeader = i === 0;

            // Calcular altura de fila según contenido
            doc.fontSize(9);
            const col2Height = doc.heightOfString(row[1] || '', { width: colWidths[1] - padding * 2 });
            const actualRowHeight = Math.max(rowHeight, col2Height + padding * 2);

            // Verificar si necesitamos nueva página
            if (startY + actualRowHeight > doc.page.height - this.margins.bottom - 50) {
                doc.addPage();
                startY = this.margins.top;
            }

            // Fondo
            if (isHeader) {
                doc.rect(startX, startY, colWidths[0] + colWidths[1], actualRowHeight)
                    .fillColor(this.colors.primary)
                    .fill();
            } else if (i % 2 === 0) {
                doc.rect(startX, startY, colWidths[0] + colWidths[1], actualRowHeight)
                    .fillColor(this.colors.lightGray)
                    .fill();
            }

            // Bordes
            doc.rect(startX, startY, colWidths[0], actualRowHeight).stroke();
            doc.rect(startX + colWidths[0], startY, colWidths[1], actualRowHeight).stroke();

            // Texto
            doc.fontSize(9)
                .fillColor(isHeader ? this.colors.white : this.colors.text)
                .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
                .text(row[0] || '', startX + padding, startY + padding, { width: colWidths[0] - padding * 2 })
                .text(row[1] || '', startX + colWidths[0] + padding, startY + padding, { width: colWidths[1] - padding * 2 });

            startY += actualRowHeight;
        }

        doc.y = startY;
    }

    formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    formatDateTime(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
            ', ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }
}

module.exports = PDFGenerator;
