/**
 * Aplicación Frontend - Sistema de Gestión de Reuniones
 * Reker Tech Solutions
 */

// Estado global de la aplicación
const App = {
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    currentView: 'dashboard',
    data: {
        clientes: [],
        reuniones: [],
        usuarios: [],
        informes: []
    }
};

// Elementos del DOM
const elements = {
    loginScreen: document.getElementById('login-screen'),
    appScreen: document.getElementById('app-screen'),
    loginForm: document.getElementById('login-form'),
    loginError: document.getElementById('login-error'),
    logoutBtn: document.getElementById('logout-btn'),
    userName: document.getElementById('user-name'),
    userRole: document.getElementById('user-role'),
    modal: document.getElementById('modal'),
    modalTitle: document.getElementById('modal-title'),
    modalBody: document.getElementById('modal-body'),
    toast: document.getElementById('toast')
};

// ================================
// API Helper
// ================================
async function api(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (App.token) {
        headers['Authorization'] = `Bearer ${App.token}`;
    }

    try {
        const response = await fetch(`/api${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error en la solicitud');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ================================
// Autenticación
// ================================
async function login(email, password) {
    try {
        const data = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        App.token = data.token;
        App.user = data.user;
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        showApp();
        showToast('Sesión iniciada correctamente', 'success');
    } catch (error) {
        elements.loginError.textContent = error.message;
    }
}

function logout() {
    App.token = null;
    App.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    showLogin();
    showToast('Sesión cerrada');
}

function showLogin() {
    elements.loginScreen.classList.remove('hidden');
    elements.appScreen.classList.add('hidden');
}

function showApp() {
    elements.loginScreen.classList.add('hidden');
    elements.appScreen.classList.remove('hidden');
    updateUserInfo();
    updateAdminVisibility();
    loadDashboard();
    navigateTo('dashboard');
}

function updateUserInfo() {
    if (App.user) {
        elements.userName.textContent = App.user.nombre;
        elements.userRole.textContent = App.user.rol;
        elements.userRole.className = `badge badge-${App.user.rol}`;
    }
}

function updateAdminVisibility() {
    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
        if (App.user?.rol !== 'admin') {
            el.classList.add('hidden');
        } else {
            el.classList.remove('hidden');
        }
    });
}

// ================================
// Navegación
// ================================
function navigateTo(view) {
    App.currentView = view;

    // Actualizar nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === view);
    });

    // Mostrar vista
    document.querySelectorAll('.view').forEach(v => {
        v.classList.toggle('active', v.id === `view-${view}`);
    });

    // Cargar datos de la vista
    switch (view) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'clientes':
            loadClientes();
            break;
        case 'reuniones':
            loadReuniones();
            break;
        case 'informes':
            loadInformes();
            break;
        case 'usuarios':
            loadUsuarios();
            break;
    }
}

// ================================
// Dashboard
// ================================
async function loadDashboard() {
    try {
        const [clientes, reuniones] = await Promise.all([
            api('/clientes'),
            api('/reuniones')
        ]);

        App.data.clientes = clientes;
        App.data.reuniones = reuniones;

        document.getElementById('stat-clientes').textContent = clientes.length;
        document.getElementById('stat-reuniones').textContent = reuniones.length;

        // Stats de informes
        try {
            const informes = await api('/informes');
            document.getElementById('stat-informes').textContent = informes.length;
        } catch {
            document.getElementById('stat-informes').textContent = '0';
        }

        // Stats de usuarios (solo admin)
        if (App.user?.rol === 'admin') {
            try {
                const usuarios = await api('/usuarios');
                document.getElementById('stat-usuarios').textContent = usuarios.length;
            } catch {
                document.getElementById('stat-usuarios').textContent = '-';
            }
        }

        // Reuniones recientes
        const recentContainer = document.getElementById('recent-reuniones');
        const recent = reuniones.slice(0, 5);

        if (recent.length === 0) {
            recentContainer.innerHTML = '<div class="data-list-item"><span style="color: var(--color-text-light)">No hay reuniones registradas</span></div>';
        } else {
            recentContainer.innerHTML = recent.map(r => `
                <div class="data-list-item">
                    <div class="data-list-info">
                        <h4>${r.cliente_empresa}</h4>
                        <span>${r.codigo_referencia} - ${formatDate(r.fecha_hora)}</span>
                    </div>
                    <div>
                        <button class="btn btn-small btn-secondary" onclick="viewReunion(${r.id})">Ver</button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        showToast('Error al cargar dashboard', 'error');
    }
}

// ================================
// Clientes
// ================================
async function loadClientes() {
    try {
        const clientes = await api('/clientes');
        App.data.clientes = clientes;
        renderClientes(clientes);
    } catch (error) {
        showToast('Error al cargar clientes', 'error');
    }
}

function renderClientes(clientes) {
    const container = document.getElementById('clientes-list');

    if (clientes.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-light); padding: 40px; text-align: center;">No hay clientes registrados</p>';
        return;
    }

    container.innerHTML = clientes.map(c => `
        <div class="data-card">
            <div class="data-card-header">
                <div>
                    <div class="data-card-title">${c.empresa}</div>
                    <div class="data-card-subtitle">${c.persona_contacto}</div>
                </div>
            </div>
            <div class="data-card-body">
                <p><strong>Cargo:</strong> ${c.cargo || '-'}</p>
                <p><strong>Email:</strong> ${c.email || '-'}</p>
                <p><strong>Teléfono:</strong> ${c.telefono || '-'}</p>
                <p><strong>Ubicación:</strong> ${c.ubicacion || '-'}</p>
            </div>
            <div class="data-card-actions">
                <button class="btn btn-small btn-secondary" onclick="viewCliente(${c.id})">Ver Detalles</button>
                ${App.user?.rol === 'admin' ? `<button class="btn btn-small btn-primary" onclick="editCliente(${c.id})">Editar</button>` : ''}
            </div>
        </div>
    `).join('');
}

function openClienteForm(cliente = null) {
    const isEdit = !!cliente;
    elements.modalTitle.textContent = isEdit ? 'Editar Cliente' : 'Nuevo Cliente';

    elements.modalBody.innerHTML = `
        <form id="cliente-form">
            <div class="form-group">
                <label>Empresa *</label>
                <input type="text" name="empresa" value="${cliente?.empresa || ''}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Persona de Contacto *</label>
                    <input type="text" name="persona_contacto" value="${cliente?.persona_contacto || ''}" required>
                </div>
                <div class="form-group">
                    <label>Cargo</label>
                    <input type="text" name="cargo" value="${cliente?.cargo || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Teléfono</label>
                    <input type="tel" name="telefono" value="${cliente?.telefono || ''}">
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" name="email" value="${cliente?.email || ''}">
                </div>
            </div>
            <div class="form-group">
                <label>Ubicación</label>
                <input type="text" name="ubicacion" value="${cliente?.ubicacion || ''}">
            </div>
            <div class="form-group">
                <label>Actividad Principal</label>
                <textarea name="actividad_principal">${cliente?.actividad_principal || ''}</textarea>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar Cambios' : 'Crear Cliente'}</button>
            </div>
        </form>
    `;

    document.getElementById('cliente-form').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);

        try {
            if (isEdit) {
                await api(`/clientes/${cliente.id}`, { method: 'PUT', body: JSON.stringify(data) });
                showToast('Cliente actualizado', 'success');
            } else {
                await api('/clientes', { method: 'POST', body: JSON.stringify(data) });
                showToast('Cliente creado', 'success');
            }
            closeModal();
            loadClientes();
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    openModal();
}

async function viewCliente(id) {
    try {
        const cliente = await api(`/clientes/${id}`);
        const reuniones = await api(`/clientes/${id}/reuniones`);

        elements.modalTitle.textContent = cliente.empresa;
        elements.modalBody.innerHTML = `
            <div class="form-section">
                <h4>Información del Cliente</h4>
                <p><strong>Persona de Contacto:</strong> ${cliente.persona_contacto}</p>
                <p><strong>Cargo:</strong> ${cliente.cargo || '-'}</p>
                <p><strong>Email:</strong> ${cliente.email || '-'}</p>
                <p><strong>Teléfono:</strong> ${cliente.telefono || '-'}</p>
                <p><strong>Ubicación:</strong> ${cliente.ubicacion || '-'}</p>
                <p><strong>Actividad:</strong> ${cliente.actividad_principal || '-'}</p>
            </div>
            <div class="form-section">
                <h4>Reuniones (${reuniones.length})</h4>
                ${reuniones.length === 0 ? '<p>No hay reuniones registradas</p>' :
                reuniones.map(r => `
                        <div class="data-list-item">
                            <div class="data-list-info">
                                <h4>${r.codigo_referencia}</h4>
                                <span>${formatDate(r.fecha_hora)} - ${r.motivo || 'Sin motivo'}</span>
                            </div>
                            <button class="btn btn-small btn-secondary" onclick="viewReunion(${r.id})">Ver</button>
                        </div>
                    `).join('')
            }
            </div>
        `;
        openModal();
    } catch (error) {
        showToast('Error al cargar cliente', 'error');
    }
}

async function editCliente(id) {
    try {
        const cliente = await api(`/clientes/${id}`);
        openClienteForm(cliente);
    } catch (error) {
        showToast('Error al cargar cliente', 'error');
    }
}

// ================================
// Reuniones
// ================================
async function loadReuniones() {
    try {
        const reuniones = await api('/reuniones');
        App.data.reuniones = reuniones;
        renderReuniones(reuniones);
    } catch (error) {
        showToast('Error al cargar reuniones', 'error');
    }
}

function renderReuniones(reuniones) {
    const container = document.getElementById('reuniones-list');

    if (reuniones.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-light); padding: 40px; text-align: center;">No hay reuniones registradas</p>';
        return;
    }

    container.innerHTML = reuniones.map(r => `
        <div class="data-card">
            <div class="data-card-header">
                <div>
                    <div class="data-card-title">${r.codigo_referencia}</div>
                    <div class="data-card-subtitle">${r.cliente_empresa}</div>
                </div>
                <span class="badge badge-tecnico">${formatDate(r.fecha_hora)}</span>
            </div>
            <div class="data-card-body">
                <p><strong>Lugar:</strong> ${r.lugar || '-'}</p>
                <p><strong>Motivo:</strong> ${r.motivo || '-'}</p>
            </div>
            <div class="data-card-actions">
                <button class="btn btn-small btn-secondary" onclick="viewReunion(${r.id})">Ver</button>
                <button class="btn btn-small btn-primary" onclick="editReunion(${r.id})">Editar</button>
                <button class="btn btn-small btn-ghost" onclick="generatePDF(${r.id})">📄 PDF</button>
                <button class="btn btn-small btn-ghost" onclick="generateDOCX(${r.id})">📝 Word</button>
            </div>
        </div>
    `).join('');
}

async function openReunionForm(reunion = null) {
    const isEdit = !!reunion;

    // Cargar clientes para el select
    if (App.data.clientes.length === 0) {
        await loadClientes();
    }

    elements.modalTitle.textContent = isEdit ? 'Editar Reunión' : 'Nueva Reunión';

    const asistentes = reunion?.asistentes || [];

    elements.modalBody.innerHTML = `
        <form id="reunion-form">
            <div class="form-section">
                <h4>Datos Generales</h4>
                <div class="form-row">
                    <div class="form-group">
                        <label>Cliente *</label>
                        <select name="cliente_id" required ${isEdit ? 'disabled' : ''}>
                            <option value="">Seleccionar cliente...</option>
                            ${App.data.clientes.map(c => `<option value="${c.id}" ${reunion?.cliente_id === c.id ? 'selected' : ''}>${c.empresa}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Fecha y Hora *</label>
                        <input type="datetime-local" name="fecha_hora" value="${reunion ? formatDateTimeLocal(reunion.fecha_hora) : ''}" required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Lugar</label>
                        <input type="text" name="lugar" value="${reunion?.lugar || ''}" placeholder="Oficinas cliente / Videoconferencia">
                    </div>
                    <div class="form-group">
                        <label>Autor del Documento</label>
                        <input type="text" name="autor_documento" value="${reunion?.autor_documento || App.user?.nombre || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Motivo de la Reunión</label>
                    <textarea name="motivo" placeholder="Propósito de la convocatoria">${reunion?.motivo || ''}</textarea>
                </div>
            </div>

            <div class="form-section">
                <h4>Asistentes</h4>
                <div id="asistentes-list" class="asistentes-list">
                    ${asistentes.map((a, i) => createAsistenteItem(a, i)).join('')}
                </div>
                <button type="button" class="btn btn-small btn-secondary" onclick="addAsistente()">+ Añadir Asistente</button>
            </div>

            <div class="form-section">
                <h4>3. Resumen Ejecutivo</h4>
                <div class="form-group">
                    <label>Síntesis de la Reunión (5-6 líneas)</label>
                    <textarea name="resumen_sintesis" placeholder="¿Cuál es el contexto? ¿Qué quiere el cliente? ¿Cuál es la conclusión principal?">${reunion?.resumen_ejecutivo?.sintesis || ''}</textarea>
                </div>
            </div>

            <div class="form-section">
                <h4>4. Necesidad Principal del Cliente</h4>
                <div class="form-group">
                    <label>¿Qué solicita explícitamente?</label>
                    <textarea name="solicitud_explicita" placeholder="Transcribir la petición del cliente usando sus propias palabras">${reunion?.necesidad_cliente?.solicitud_explicita || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>¿Qué objetivo de negocio persigue?</label>
                    <textarea name="objetivo_negocio" placeholder="Aumentar producción, reducir costes, cumplir legislación...">${reunion?.necesidad_cliente?.objetivo_negocio || ''}</textarea>
                </div>
            </div>

            <div class="form-section">
                <h4>5. Situación Actual</h4>
                <div class="form-group">
                    <label>¿Cómo funciona el proceso ahora?</label>
                    <textarea name="proceso_actual" placeholder="Describir estado actual. ¿Es manual? ¿Quién lo hace?">${reunion?.situacion_actual?.proceso_actual || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>¿Qué equipos tiene instalados?</label>
                    <textarea name="equipos_instalados" placeholder="Listar equipamiento, marcas, modelos, antigüedad">${reunion?.situacion_actual?.equipos_instalados || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Limitaciones y problemas</label>
                    <textarea name="limitaciones_problemas" placeholder="Detallar ineficiencias o problemas mencionados">${reunion?.situacion_actual?.limitaciones_problemas || ''}</textarea>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar Cambios' : 'Crear Reunión'}</button>
            </div>
        </form>
    `;

    document.getElementById('reunion-form').onsubmit = async (e) => {
        e.preventDefault();
        await saveReunion(e.target, isEdit ? reunion.id : null);
    };

    openModal();
}

function createAsistenteItem(asistente = {}, index = Date.now()) {
    return `
        <div class="asistente-item" data-index="${index}">
            <input type="text" name="asistente_nombre_${index}" value="${asistente.nombre || ''}" placeholder="Nombre">
            <input type="text" name="asistente_cargo_${index}" value="${asistente.cargo || ''}" placeholder="Cargo">
            <select name="asistente_tipo_${index}">
                <option value="cliente" ${asistente.tipo === 'cliente' ? 'selected' : ''}>Cliente</option>
                <option value="reker" ${asistente.tipo === 'reker' ? 'selected' : ''}>Reker</option>
            </select>
            <button type="button" onclick="removeAsistente(${index})">×</button>
        </div>
    `;
}

function addAsistente() {
    const container = document.getElementById('asistentes-list');
    container.insertAdjacentHTML('beforeend', createAsistenteItem());
}

function removeAsistente(index) {
    const item = document.querySelector(`.asistente-item[data-index="${index}"]`);
    if (item) item.remove();
}

async function saveReunion(form, reunionId = null) {
    const formData = new FormData(form);

    // Recoger asistentes
    const asistentes = [];
    document.querySelectorAll('.asistente-item').forEach(item => {
        const index = item.dataset.index;
        const nombre = formData.get(`asistente_nombre_${index}`);
        if (nombre) {
            asistentes.push({
                nombre,
                cargo: formData.get(`asistente_cargo_${index}`),
                tipo: formData.get(`asistente_tipo_${index}`)
            });
        }
    });

    const data = {
        cliente_id: parseInt(formData.get('cliente_id')),
        fecha_hora: formData.get('fecha_hora'),
        lugar: formData.get('lugar'),
        motivo: formData.get('motivo'),
        autor_documento: formData.get('autor_documento'),
        asistentes,
        resumen_ejecutivo: {
            sintesis: formData.get('resumen_sintesis')
        },
        necesidad_cliente: {
            solicitud_explicita: formData.get('solicitud_explicita'),
            objetivo_negocio: formData.get('objetivo_negocio')
        },
        situacion_actual: {
            proceso_actual: formData.get('proceso_actual'),
            equipos_instalados: formData.get('equipos_instalados'),
            limitaciones_problemas: formData.get('limitaciones_problemas')
        }
    };

    try {
        if (reunionId) {
            await api(`/reuniones/${reunionId}`, { method: 'PUT', body: JSON.stringify(data) });
            showToast('Reunión actualizada', 'success');
        } else {
            await api('/reuniones', { method: 'POST', body: JSON.stringify(data) });
            showToast('Reunión creada', 'success');
        }
        closeModal();
        loadReuniones();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function viewReunion(id) {
    try {
        const reunion = await api(`/reuniones/${id}`);

        elements.modalTitle.textContent = `Reunión ${reunion.codigo_referencia}`;
        elements.modalBody.innerHTML = `
            <div class="form-section">
                <h4>Datos de la Reunión</h4>
                <p><strong>Cliente:</strong> ${reunion.cliente?.empresa}</p>
                <p><strong>Fecha:</strong> ${formatDateTime(reunion.fecha_hora)}</p>
                <p><strong>Lugar:</strong> ${reunion.lugar || '-'}</p>
                <p><strong>Motivo:</strong> ${reunion.motivo || '-'}</p>
            </div>
            <div class="form-section">
                <h4>Asistentes</h4>
                ${(reunion.asistentes || []).map(a => `<p>• ${a.nombre} (${a.cargo || 'Sin cargo'}) - ${a.tipo}</p>`).join('') || '<p>Sin asistentes registrados</p>'}
            </div>
            <div class="form-section">
                <h4>Resumen Ejecutivo</h4>
                <p>${reunion.resumen_ejecutivo?.sintesis || 'No completado'}</p>
            </div>
            <div class="form-section">
                <h4>Necesidad del Cliente</h4>
                <p><strong>Solicita:</strong> ${reunion.necesidad_cliente?.solicitud_explicita || '-'}</p>
                <p><strong>Objetivo:</strong> ${reunion.necesidad_cliente?.objetivo_negocio || '-'}</p>
            </div>
            <div class="form-section">
                <h4>Situación Actual</h4>
                <p><strong>Proceso:</strong> ${reunion.situacion_actual?.proceso_actual || '-'}</p>
                <p><strong>Equipos:</strong> ${reunion.situacion_actual?.equipos_instalados || '-'}</p>
                <p><strong>Problemas:</strong> ${reunion.situacion_actual?.limitaciones_problemas || '-'}</p>
            </div>
            <div class="form-section">
                <h4>Anexos (${(reunion.anexos || []).length})</h4>
                ${(reunion.anexos || []).map(a => `<p>• ${a.nombre_archivo || a.descripcion} (${a.tipo})</p>`).join('') || '<p>Sin anexos</p>'}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
                <button class="btn btn-primary" onclick="editReunion(${id}); closeModal();">Editar</button>
                <button class="btn btn-ghost" onclick="generatePDF(${id})">📄 Generar PDF</button>
                <button class="btn btn-ghost" onclick="generateDOCX(${id})">📝 Generar Word</button>
            </div>
        `;
        openModal();
    } catch (error) {
        showToast('Error al cargar reunión', 'error');
    }
}

async function editReunion(id) {
    try {
        const reunion = await api(`/reuniones/${id}`);
        openReunionForm(reunion);
    } catch (error) {
        showToast('Error al cargar reunión', 'error');
    }
}

// ================================
// Informes
// ================================
async function loadInformes() {
    try {
        const [reuniones, informes] = await Promise.all([
            api('/reuniones'),
            api('/informes')
        ]);

        // Lista de reuniones para generar informes
        const reunionesContainer = document.getElementById('reuniones-informes-list');
        if (reuniones.length === 0) {
            reunionesContainer.innerHTML = '<div class="data-list-item"><span>No hay reuniones disponibles</span></div>';
        } else {
            reunionesContainer.innerHTML = reuniones.map(r => `
                <div class="data-list-item">
                    <div class="data-list-info">
                        <h4>${r.codigo_referencia} - ${r.cliente_empresa}</h4>
                        <span>${formatDate(r.fecha_hora)}</span>
                    </div>
                    <div>
                        <button class="btn btn-small btn-primary" onclick="generatePDF(${r.id})">📄 PDF</button>
                        <button class="btn btn-small btn-secondary" onclick="generateDOCX(${r.id})">📝 Word</button>
                    </div>
                </div>
            `).join('');
        }

        // Lista de informes generados
        const informesContainer = document.getElementById('informes-generados-list');
        if (informes.length === 0) {
            informesContainer.innerHTML = '<div class="data-list-item"><span>No hay informes generados</span></div>';
        } else {
            informesContainer.innerHTML = informes.map(i => `
                <div class="data-list-item">
                    <div class="data-list-info">
                        <h4>${i.nombre}</h4>
                        <span>${i.tipo} - ${formatFileSize(i.tamaño)} - ${formatDate(i.fecha)}</span>
                    </div>
                    <div>
                        <a href="/reports/${i.nombre}" class="btn btn-small btn-secondary" download>Descargar</a>
                        ${App.user?.rol === 'admin' ? `<button class="btn btn-small btn-danger" onclick="deleteInforme('${i.nombre}')">Eliminar</button>` : ''}
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        showToast('Error al cargar informes', 'error');
    }
}

async function generatePDF(reunionId) {
    showToast('Generando PDF...', 'success');
    try {
        const response = await fetch(`/api/informes/${reunionId}/pdf`, {
            headers: { 'Authorization': `Bearer ${App.token}` }
        });
        if (!response.ok) throw new Error('Error al generar PDF');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Informe_Reunion_${reunionId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast('PDF descargado', 'success');
    } catch (error) {
        showToast('Error al generar PDF', 'error');
    }
}

async function generateDOCX(reunionId) {
    showToast('Generando Word...', 'success');
    try {
        const response = await fetch(`/api/informes/${reunionId}/docx`, {
            headers: { 'Authorization': `Bearer ${App.token}` }
        });
        if (!response.ok) throw new Error('Error al generar Word');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Informe_Reunion_${reunionId}.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast('Word descargado', 'success');
    } catch (error) {
        showToast('Error al generar Word', 'error');
    }
}

async function deleteInforme(filename) {
    if (!confirm('¿Eliminar este informe?')) return;

    try {
        await api(`/informes/${filename}`, { method: 'DELETE' });
        showToast('Informe eliminado', 'success');
        loadInformes();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ================================
// Usuarios
// ================================
async function loadUsuarios() {
    if (App.user?.rol !== 'admin') return;

    try {
        const usuarios = await api('/usuarios');
        App.data.usuarios = usuarios;
        renderUsuarios(usuarios);
    } catch (error) {
        showToast('Error al cargar usuarios', 'error');
    }
}

function renderUsuarios(usuarios) {
    const container = document.getElementById('usuarios-list');

    container.innerHTML = usuarios.map(u => `
        <div class="data-card">
            <div class="data-card-header">
                <div>
                    <div class="data-card-title">${u.nombre}</div>
                    <div class="data-card-subtitle">${u.email}</div>
                </div>
                <span class="badge badge-${u.rol}">${u.rol}</span>
            </div>
            <div class="data-card-body">
                <p><strong>Estado:</strong> ${u.activo ? 'Activo' : 'Inactivo'}</p>
                ${u.cliente_empresa ? `<p><strong>Cliente:</strong> ${u.cliente_empresa}</p>` : ''}
            </div>
            <div class="data-card-actions">
                <button class="btn btn-small btn-primary" onclick="editUsuario(${u.id})">Editar</button>
                ${u.id !== App.user?.id ? `<button class="btn btn-small btn-danger" onclick="deleteUsuario(${u.id})">Eliminar</button>` : ''}
            </div>
        </div>
    `).join('');
}

async function openUsuarioForm(usuario = null) {
    const isEdit = !!usuario;

    if (App.data.clientes.length === 0) {
        await loadClientes();
    }

    elements.modalTitle.textContent = isEdit ? 'Editar Usuario' : 'Nuevo Usuario';

    elements.modalBody.innerHTML = `
        <form id="usuario-form">
            <div class="form-group">
                <label>Nombre *</label>
                <input type="text" name="nombre" value="${usuario?.nombre || ''}" required>
            </div>
            <div class="form-group">
                <label>Email *</label>
                <input type="email" name="email" value="${usuario?.email || ''}" required>
            </div>
            <div class="form-group">
                <label>${isEdit ? 'Nueva Contraseña (dejar vacío para mantener)' : 'Contraseña *'}</label>
                <input type="password" name="password" ${!isEdit ? 'required' : ''} minlength="6">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Rol</label>
                    <select name="rol">
                        <option value="tecnico" ${usuario?.rol === 'tecnico' ? 'selected' : ''}>Técnico</option>
                        <option value="admin" ${usuario?.rol === 'admin' ? 'selected' : ''}>Administrador</option>
                        <option value="cliente" ${usuario?.rol === 'cliente' ? 'selected' : ''}>Cliente</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Cliente Asociado</label>
                    <select name="cliente_id">
                        <option value="">Ninguno</option>
                        ${App.data.clientes.map(c => `<option value="${c.id}" ${usuario?.cliente_id === c.id ? 'selected' : ''}>${c.empresa}</option>`).join('')}
                    </select>
                </div>
            </div>
            ${isEdit ? `
                <div class="form-group">
                    <label>
                        <input type="checkbox" name="activo" ${usuario?.activo ? 'checked' : ''}> Usuario activo
                    </label>
                </div>
            ` : ''}
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar' : 'Crear Usuario'}</button>
            </div>
        </form>
    `;

    document.getElementById('usuario-form').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            nombre: formData.get('nombre'),
            email: formData.get('email'),
            rol: formData.get('rol'),
            cliente_id: formData.get('cliente_id') || null
        };

        if (formData.get('password')) {
            data.password = formData.get('password');
        }

        if (isEdit) {
            data.activo = formData.get('activo') === 'on' ? 1 : 0;
        }

        try {
            if (isEdit) {
                await api(`/usuarios/${usuario.id}`, { method: 'PUT', body: JSON.stringify(data) });
                showToast('Usuario actualizado', 'success');
            } else {
                await api('/usuarios', { method: 'POST', body: JSON.stringify(data) });
                showToast('Usuario creado', 'success');
            }
            closeModal();
            loadUsuarios();
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    openModal();
}

async function editUsuario(id) {
    try {
        const usuario = await api(`/usuarios/${id}`);
        openUsuarioForm(usuario);
    } catch (error) {
        showToast('Error al cargar usuario', 'error');
    }
}

async function deleteUsuario(id) {
    if (!confirm('¿Eliminar este usuario?')) return;

    try {
        await api(`/usuarios/${id}`, { method: 'DELETE' });
        showToast('Usuario eliminado', 'success');
        loadUsuarios();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ================================
// Modal
// ================================
function openModal() {
    elements.modal.classList.add('active');
}

function closeModal() {
    elements.modal.classList.remove('active');
}

// ================================
// Toast
// ================================
function showToast(message, type = '') {
    elements.toast.textContent = message;
    elements.toast.className = `toast active ${type}`;

    setTimeout(() => {
        elements.toast.classList.remove('active');
    }, 3000);
}

// ================================
// Utilidades
// ================================
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTimeLocal(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toISOString().slice(0, 16);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ================================
// Búsqueda
// ================================
function setupSearch() {
    document.getElementById('search-clientes')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = App.data.clientes.filter(c =>
            c.empresa.toLowerCase().includes(query) ||
            c.persona_contacto.toLowerCase().includes(query)
        );
        renderClientes(filtered);
    });

    document.getElementById('search-reuniones')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = App.data.reuniones.filter(r =>
            r.codigo_referencia.toLowerCase().includes(query) ||
            r.cliente_empresa.toLowerCase().includes(query) ||
            (r.motivo || '').toLowerCase().includes(query)
        );
        renderReuniones(filtered);
    });
}

// ================================
// Event Listeners
// ================================
document.addEventListener('DOMContentLoaded', () => {
    // Login
    elements.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        login(email, password);
    });

    // Logout
    elements.logoutBtn.addEventListener('click', logout);

    // Navegación
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(item.dataset.view);
        });
    });

    // Botones de crear
    document.getElementById('btn-nuevo-cliente')?.addEventListener('click', () => openClienteForm());
    document.getElementById('btn-nueva-reunion')?.addEventListener('click', () => openReunionForm());
    document.getElementById('btn-nuevo-usuario')?.addEventListener('click', () => openUsuarioForm());

    // Cerrar modal
    document.querySelector('.modal-close')?.addEventListener('click', closeModal);
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) closeModal();
    });

    // Búsqueda
    setupSearch();

    // Verificar sesión existente
    if (App.token && App.user) {
        showApp();
    } else {
        showLogin();
    }
});
