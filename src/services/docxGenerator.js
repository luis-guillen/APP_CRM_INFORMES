const {
    Document,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    BorderStyle,
    HeadingLevel,
    PageBreak,
    Header,
    Footer,
    PageNumber,
    NumberFormat,
    ImageRun,
    Packer
} = require('docx');
const fs = require('fs');
const path = require('path');

/**
 * Generador de informes Word (.docx) para Reker Tech Solutions
 * Formato exacto al documento base
 */
class DocxGenerator {
    constructor() {
        this.colors = {
            primary: '1a365d',
            secondary: '2c5282',
            accent: '3182ce',
            text: '1a202c',
            lightGray: 'e2e8f0'
        };
    }

    /**
     * Genera el informe Word completo
     * @param {Object} data - Datos de la reunión
     * @param {string} outputPath - Ruta de salida del documento
     * @returns {Promise<string>} - Ruta del archivo generado
     */
    async generate(data, outputPath) {
        const doc = new Document({
            title: `Informe de Reunión - ${data.cliente.empresa}`,
            description: 'Informe de Reunión y Definición de Necesidades',
            creator: 'Reker Tech Solutions',
            sections: [
                // Portada
                this.createCoverPage(data),
                // Contenido principal
                this.createMainContent(data)
            ]
        });

        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync(outputPath, buffer);
        return outputPath;
    }

    /**
     * Crea la portada del documento
     */
    createCoverPage(data) {
        return {
            properties: {},
            children: [
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 2000 },
                    children: [
                        new TextRun({
                            text: 'Reker Tech Solutions',
                            bold: true,
                            size: 56,
                            color: this.colors.primary
                        })
                    ]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({
                            text: 'Ingeniería Industrial y Automatización',
                            size: 28,
                            color: this.colors.secondary
                        })
                    ]
                }),
                new Paragraph({ spacing: { before: 400, after: 400 } }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({
                            text: 'Informe de Reunión y',
                            bold: true,
                            size: 44,
                            color: this.colors.primary
                        })
                    ]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({
                            text: 'Definición de Necesidades',
                            bold: true,
                            size: 44,
                            color: this.colors.primary
                        })
                    ]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 200 },
                    children: [
                        new TextRun({
                            text: 'Documento Comercial-Técnico',
                            size: 24,
                            color: this.colors.secondary
                        })
                    ]
                }),
                new Paragraph({ spacing: { before: 1000 } }),
                this.createLabelValueParagraph('Autor del documento:', data.autor_documento || '[Responsable]'),
                this.createLabelValueParagraph('Cliente:', data.cliente.empresa),
                this.createLabelValueParagraph('Código / Referencia Interna:', data.codigo_referencia),
                this.createLabelValueParagraph('Fecha de Reunión:', this.formatDate(data.fecha_hora)),
                this.createLabelValueParagraph('Fecha del Documento:', this.formatDate(new Date())),
                new Paragraph({ children: [new PageBreak()] })
            ]
        };
    }

    /**
     * Crea el contenido principal del documento
     */
    createMainContent(data) {
        const children = [];

        // Índice
        children.push(this.createHeading('Índice', 0));
        children.push(...this.createTableOfContents());
        children.push(new Paragraph({ children: [new PageBreak()] }));

        // Sección 1: Ficha del Cliente
        children.push(this.createHeading('1. Ficha del Cliente', 1));
        children.push(this.createClientTable(data.cliente));
        children.push(new Paragraph({ spacing: { after: 400 } }));

        // Sección 2: Datos de la Reunión
        children.push(this.createHeading('2. Datos de la Reunión', 1));
        children.push(this.createMeetingTable(data));
        children.push(new Paragraph({ spacing: { after: 400 } }));

        // Sección 3: Resumen Ejecutivo
        children.push(this.createHeading('3. Resumen Ejecutivo', 1));
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: 'Síntesis de la Reunión (5-6 líneas máximo)',
                    bold: true,
                    size: 20,
                    color: this.colors.secondary
                })
            ]
        }));
        children.push(new Paragraph({
            spacing: { before: 200, after: 400 },
            border: {
                top: { style: BorderStyle.SINGLE, size: 1, color: this.colors.lightGray },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: this.colors.lightGray },
                left: { style: BorderStyle.SINGLE, size: 1, color: this.colors.lightGray },
                right: { style: BorderStyle.SINGLE, size: 1, color: this.colors.lightGray }
            },
            children: [
                new TextRun({
                    text: data.resumen_ejecutivo?.sintesis || '[Resumir la esencia de la reunión. ¿Cuál es el contexto? ¿Qué quiere el cliente? ¿Cuál es la conclusión principal o el siguiente paso acordado?]',
                    size: 20
                })
            ]
        }));

        // Sección 4: Necesidad Principal del Cliente
        children.push(this.createHeading('4. Necesidad Principal del Cliente', 1));
        children.push(this.createNeedsTable(data.necesidad_cliente));
        children.push(new Paragraph({ spacing: { after: 400 } }));

        // Sección 5: Situación Actual
        children.push(this.createHeading('5. Situación Actual', 1));
        children.push(this.createSituationTable(data.situacion_actual));
        children.push(new Paragraph({ children: [new PageBreak()] }));

        // Anexos
        children.push(this.createHeading('A. Anexos', 1));
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: 'En este anexo se recogen los documentos y material gráfico de apoyo relacionado con el cliente y la reunión.',
                    size: 20
                })
            ]
        }));
        children.push(...this.createAnexos(data.anexos));

        // Pie de confidencialidad
        children.push(new Paragraph({ spacing: { before: 1000 } }));
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: `Documento Confidencial © ${new Date().getFullYear()} Reker Tech Solutions`,
                    bold: true,
                    size: 18,
                    color: this.colors.secondary
                })
            ]
        }));
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: 'Este documento es para uso interno y preparación de oferta para el cliente mencionado.',
                    size: 16,
                    color: this.colors.secondary
                })
            ]
        }));
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: 'No debe ser distribuido sin autorización.',
                    size: 16,
                    color: this.colors.secondary
                })
            ]
        }));

        return {
            properties: {},
            headers: {
                default: new Header({
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            children: [
                                new TextRun({
                                    text: 'Reker Tech Solutions - Informe de Reunión',
                                    size: 16,
                                    color: this.colors.secondary
                                })
                            ]
                        })
                    ]
                })
            },
            footers: {
                default: new Footer({
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({
                                    text: 'Ingeniería Industrial y Automatización | Documento Comercial-Técnico | Página ',
                                    size: 16,
                                    color: this.colors.secondary
                                }),
                                new TextRun({
                                    children: [PageNumber.CURRENT]
                                })
                            ]
                        })
                    ]
                })
            },
            children
        };
    }

    createTableOfContents() {
        const items = [
            '1. Ficha del Cliente',
            '2. Datos de la Reunión',
            '3. Resumen Ejecutivo',
            '4. Necesidad Principal del Cliente',
            '5. Situación Actual',
            'A. Anexos',
            '   A.1. Documentación Recibida del Cliente',
            '   A.2. Fotografías de la Reunión',
            '   A.3. Notas Adicionales'
        ];

        return items.map(item => new Paragraph({
            spacing: { after: 100 },
            children: [
                new TextRun({ text: item, size: 22 })
            ]
        }));
    }

    createHeading(text, level) {
        return new Paragraph({
            heading: level === 0 ? HeadingLevel.TITLE : HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
            children: [
                new TextRun({
                    text,
                    bold: true,
                    size: level === 0 ? 36 : 28,
                    color: this.colors.primary
                })
            ]
        });
    }

    createLabelValueParagraph(label, value) {
        return new Paragraph({
            spacing: { after: 100 },
            children: [
                new TextRun({ text: label, bold: true, size: 22 }),
                new TextRun({ text: ' ' + (value || ''), size: 22 })
            ]
        });
    }

    createClientTable(cliente) {
        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                this.createTableHeaderRow(['Campo', 'Información']),
                this.createTableRow(['Empresa', cliente.empresa || '']),
                this.createTableRow(['Persona de Contacto', cliente.persona_contacto || '']),
                this.createTableRow(['Cargo', cliente.cargo || '']),
                this.createTableRow(['Teléfono / Email', `${cliente.telefono || ''} / ${cliente.email || ''}`]),
                this.createTableRow(['Ubicación', cliente.ubicacion || '']),
                this.createTableRow(['Actividad Principal', cliente.actividad_principal || ''])
            ]
        });
    }

    createMeetingTable(data) {
        const asistentesCliente = (data.asistentes || [])
            .filter(a => a.tipo === 'cliente')
            .map(a => `${a.nombre}${a.cargo ? ' (' + a.cargo + ')' : ''}`)
            .join(', ') || 'No especificado';

        const asistentesReker = (data.asistentes || [])
            .filter(a => a.tipo === 'reker')
            .map(a => `${a.nombre}${a.cargo ? ' (' + a.cargo + ')' : ''}`)
            .join(', ') || 'No especificado';

        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                this.createTableHeaderRow(['Campo', 'Información']),
                this.createTableRow(['Fecha y Hora', this.formatDateTime(data.fecha_hora)]),
                this.createTableRow(['Lugar', data.lugar || '']),
                this.createTableRow(['Asistentes', `Por parte del Cliente: ${asistentesCliente}\nPor nuestra parte: ${asistentesReker}`]),
                this.createTableRow(['Motivo de la Reunión', data.motivo || ''])
            ]
        });
    }

    createNeedsTable(necesidad) {
        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                this.createTableHeaderRow(['Aspecto', 'Descripción']),
                this.createTableRow(['¿Qué solicita explícitamente?', necesidad?.solicitud_explicita || '[Transcribir la petición del cliente usando sus propias palabras]']),
                this.createTableRow(['¿Qué objetivo de negocio persigue?', necesidad?.objetivo_negocio || '[Traducir a objetivo de negocio: aumentar producción, reducir costes, cumplir legislación]'])
            ]
        });
    }

    createSituationTable(situacion) {
        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                this.createTableHeaderRow(['Aspecto', 'Descripción']),
                this.createTableRow(['¿Cómo funciona el proceso ahora?', situacion?.proceso_actual || '[Describir estado actual. ¿Es manual? ¿Quién lo hace? ¿Cuáles son los pasos?]']),
                this.createTableRow(['¿Qué equipos tiene instalados?', situacion?.equipos_instalados || '[Listar equipamiento, marcas, modelos, antigüedad]']),
                this.createTableRow(['Limitaciones y problemas', situacion?.limitaciones_problemas || '[Detallar ineficiencias o problemas mencionados]'])
            ]
        });
    }

    createTableHeaderRow(cells) {
        return new TableRow({
            children: cells.map(text => new TableCell({
                shading: { fill: this.colors.primary },
                children: [
                    new Paragraph({
                        children: [
                            new TextRun({ text, bold: true, size: 20, color: 'ffffff' })
                        ]
                    })
                ]
            }))
        });
    }

    createTableRow(cells) {
        return new TableRow({
            children: cells.map((text, i) => new TableCell({
                width: { size: i === 0 ? 30 : 70, type: WidthType.PERCENTAGE },
                children: [
                    new Paragraph({
                        children: [
                            new TextRun({ text: text || '', size: 20 })
                        ]
                    })
                ]
            }))
        });
    }

    createAnexos(anexos) {
        const paragraphs = [];

        // A.1 Documentación
        paragraphs.push(new Paragraph({
            spacing: { before: 300, after: 100 },
            children: [
                new TextRun({ text: 'A.1. Documentación Recibida del Cliente', bold: true, size: 24, color: this.colors.primary })
            ]
        }));

        const documentos = (anexos || []).filter(a => a.tipo === 'documento');
        if (documentos.length > 0) {
            for (const doc of documentos) {
                paragraphs.push(new Paragraph({
                    children: [
                        new TextRun({ text: `• ${doc.nombre_archivo}${doc.descripcion ? ': ' + doc.descripcion : ''}`, size: 20 })
                    ]
                }));
            }
        } else {
            paragraphs.push(new Paragraph({
                children: [
                    new TextRun({ text: '[Sin documentación adjunta]', italics: true, size: 20 })
                ]
            }));
        }

        // A.2 Fotografías
        paragraphs.push(new Paragraph({
            spacing: { before: 300, after: 100 },
            children: [
                new TextRun({ text: 'A.2. Fotografías de la Reunión', bold: true, size: 24, color: this.colors.primary })
            ]
        }));

        const fotografias = (anexos || []).filter(a => a.tipo === 'fotografia');
        if (fotografias.length > 0) {
            paragraphs.push(new Paragraph({
                children: [
                    new TextRun({ text: 'Fotografías tomadas durante la visita o reunión con el cliente:', size: 20 })
                ]
            }));
            for (const foto of fotografias) {
                paragraphs.push(new Paragraph({
                    children: [
                        new TextRun({ text: `• ${foto.nombre_archivo}`, size: 20 })
                    ]
                }));
            }
        } else {
            paragraphs.push(new Paragraph({
                children: [
                    new TextRun({ text: '[Sin fotografías adjuntas]', italics: true, size: 20 })
                ]
            }));
        }

        // A.3 Notas
        paragraphs.push(new Paragraph({
            spacing: { before: 300, after: 100 },
            children: [
                new TextRun({ text: 'A.3. Notas Adicionales', bold: true, size: 24, color: this.colors.primary })
            ]
        }));

        const notas = (anexos || []).filter(a => a.tipo === 'nota');
        if (notas.length > 0) {
            for (const nota of notas) {
                paragraphs.push(new Paragraph({
                    children: [
                        new TextRun({ text: `• ${nota.descripcion}`, size: 20 })
                    ]
                }));
            }
        } else {
            paragraphs.push(new Paragraph({
                children: [
                    new TextRun({ text: '[Sin notas adicionales]', italics: true, size: 20 })
                ]
            }));
        }

        return paragraphs;
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

module.exports = DocxGenerator;
