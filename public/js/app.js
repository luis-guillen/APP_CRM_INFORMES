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
        case 'comunidad':
            loadComunidad();
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
        container.innerHTML = '<div class="empty-state"><p>No hay clientes registrados</p></div>';
        return;
    }

    container.innerHTML = clientes.map(c => `
        <div class="data-card ${c.publico ? 'public-card' : ''}">
            <div class="card-header">
                <h3>${c.empresa} ${c.publico ? '<span class="badge badge-public">🌐</span>' : ''}</h3>
                <div class="card-actions">
                    <button class="btn btn-ghost btn-small" onclick="toggleVisibilidad('clientes', ${c.id}, ${c.publico ? 0 : 1})" title="${c.publico ? 'Hacer privado' : 'Hacer público'}">${c.publico ? '🔒' : '🌐'}</button>
                    <button class="btn btn-ghost btn-small" onclick="openCompartirDialog('cliente', ${c.id}, '${c.empresa.replace(/'/g, "\\\\'")}')" title="Compartir">🔗</button>
                    <button class="btn btn-ghost btn-small" onclick="viewCliente(${c.id})">Ver</button>
                    <button class="btn btn-ghost btn-small admin-only" onclick="editCliente(${c.id})">Editar</button>
                    <button class="btn btn-ghost btn-small btn-danger admin-only" onclick="deleteCliente(${c.id})">Eliminar</button>
                </div>
            </div>
            <div class="card-body">
                <p><strong>Contacto:</strong> ${c.persona_contacto}</p>
                <p><strong>Teléfono:</strong> ${c.telefono || '-'}</p>
                <p><strong>Email:</strong> ${c.email || '-'}</p>
                <p><strong>Ubicación:</strong> ${c.ubicacion || '-'}</p>
            </div>
        </div>
    `).join('');
    updateAdminVisibility();
}

function openClienteForm(cliente = null) {
    const isEdit = !!cliente;
    elements.modalTitle.textContent = isEdit ? 'Editar Cliente' : 'Nuevo Cliente';

    const contactosExistentes = cliente?.contactos || [];

    elements.modalBody.innerHTML = `
        <form id="cliente-form">
            <div class="form-row">
                <div class="form-group" style="flex: 2">
                    <label>Empresa *</label>
                    <input type="text" name="empresa" value="${cliente?.empresa || ''}" required>
                </div>
                <div class="form-group" style="flex: 1">
                    <label>CIF</label>
                    <input type="text" name="cif" value="${cliente?.cif || ''}" placeholder="B12345678">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Persona de Contacto Principal *</label>
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
            
            <div class="form-section">
                <h4>Contactos Adicionales <button type="button" class="btn btn-small btn-secondary" onclick="addContactoRow()">+ Añadir</button></h4>
                <div id="contactos-container">
                    ${contactosExistentes.map((c, i) => `
                        <div class="contacto-row" style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                            <input type="text" placeholder="Nombre" value="${c.nombre || ''}" class="contacto-nombre" style="flex: 2">
                            <input type="text" placeholder="Cargo" value="${c.cargo || ''}" class="contacto-cargo" style="flex: 1">
                            <input type="tel" placeholder="Teléfono" value="${c.telefono || ''}" class="contacto-telefono" style="flex: 1">
                            <input type="email" placeholder="Email" value="${c.email || ''}" class="contacto-email" style="flex: 1">
                            <button type="button" class="btn btn-small btn-danger" onclick="this.parentElement.remove()">×</button>
                        </div>
                    `).join('')}
                </div>
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

        // Recoger contactos adicionales
        const contactoRows = document.querySelectorAll('.contacto-row');
        data.contactos = Array.from(contactoRows).map(row => ({
            nombre: row.querySelector('.contacto-nombre').value,
            cargo: row.querySelector('.contacto-cargo').value,
            telefono: row.querySelector('.contacto-telefono').value,
            email: row.querySelector('.contacto-email').value
        })).filter(c => c.nombre);

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

// Función para añadir fila de contacto
function addContactoRow() {
    const container = document.getElementById('contactos-container');
    const row = document.createElement('div');
    row.className = 'contacto-row';
    row.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';
    row.innerHTML = `
        <input type="text" placeholder="Nombre" class="contacto-nombre" style="flex: 2">
        <input type="text" placeholder="Cargo" class="contacto-cargo" style="flex: 1">
        <input type="tel" placeholder="Teléfono" class="contacto-telefono" style="flex: 1">
        <input type="email" placeholder="Email" class="contacto-email" style="flex: 1">
        <button type="button" class="btn btn-small btn-danger" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(row);
}


async function viewCliente(id) {
    try {
        const cliente = await api(`/clientes/${id}`);
        const reuniones = await api(`/clientes/${id}/reuniones`);

        elements.modalTitle.textContent = cliente.empresa;
        elements.modalBody.innerHTML = `
            <div class="form-section">
                <h4>Información del Cliente</h4>
                <p><strong>CIF:</strong> ${cliente.cif || '-'}</p>
                <p><strong>Persona de Contacto Principal:</strong> ${cliente.persona_contacto}</p>
                <p><strong>Cargo:</strong> ${cliente.cargo || '-'}</p>
                <p><strong>Email:</strong> ${cliente.email || '-'}</p>
                <p><strong>Teléfono:</strong> ${cliente.telefono || '-'}</p>
                <p><strong>Ubicación:</strong> ${cliente.ubicacion || '-'}</p>
                <p><strong>Actividad:</strong> ${cliente.actividad_principal || '-'}</p>
            </div>
            ${cliente.contactos && cliente.contactos.length > 0 ? `
            <div class="form-section">
                <h4>Contactos Adicionales (${cliente.contactos.length})</h4>
                ${cliente.contactos.map(c => `
                    <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                        <p><strong>${c.nombre}</strong> ${c.cargo ? `- ${c.cargo}` : ''}</p>
                        <p style="font-size: 0.9em;">📧 ${c.email || '-'} | 📞 ${c.telefono || '-'}</p>
                    </div>
                `).join('')}
            </div>
            ` : ''}
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

async function deleteCliente(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar este cliente? Se eliminarán también todas sus reuniones.')) return;

    try {
        await api(`/clientes/${id}`, { method: 'DELETE' });
        showToast('Cliente eliminado', 'success');
        loadClientes();
        loadDashboard();
    } catch (error) {
        showToast(error.message || 'Error al eliminar cliente', 'error');
    }
}

async function deleteReunion(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta reunión?')) return;

    try {
        await api(`/reuniones/${id}`, { method: 'DELETE' });
        showToast('Reunión eliminada', 'success');
        loadReuniones();
        loadDashboard();
    } catch (error) {
        showToast(error.message || 'Error al eliminar reunión', 'error');
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
        container.innerHTML = '<div class="empty-state"><p>No hay reuniones registradas</p></div>';
        return;
    }

    container.innerHTML = reuniones.map(r => `
        <div class="data-card ${r.publico ? 'public-card' : ''}">
            <div class="card-header">
                <h3>${r.codigo_referencia} ${r.publico ? '<span class="badge badge-public">🌐</span>' : ''}</h3>
                <div class="card-actions">
                    <button class="btn btn-ghost btn-small" onclick="toggleVisibilidad('reuniones', ${r.id}, ${r.publico ? 0 : 1})" title="${r.publico ? 'Hacer privado' : 'Hacer público'}">${r.publico ? '🔒' : '🌐'}</button>
                    <button class="btn btn-ghost btn-small" onclick="openCompartirDialog('reunion', ${r.id}, '${r.codigo_referencia.replace(/'/g, "\\\\'")}')" title="Compartir">🔗</button>
                    <button class="btn btn-ghost btn-small" onclick="viewReunion(${r.id})">Ver</button>
                    <button class="btn btn-ghost btn-small" onclick="editReunion(${r.id})">Editar</button>
                    <button class="btn btn-ghost btn-small btn-danger" onclick="deleteReunion(${r.id})">Eliminar</button>
                </div>
            </div>
            <div class="card-body">
                <p><strong>Cliente:</strong> ${r.cliente_empresa}</p>
                <p><strong>Fecha:</strong> ${formatDateTime(r.fecha_hora)}</p>
                <p><strong>Lugar:</strong> ${r.lugar || '-'}</p>
                <p><strong>Motivo:</strong> ${r.motivo || '-'}</p>
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

    // Extraer notas adicionales de los anexos existentes
    const notasExistentes = (reunion?.anexos || [])
        .filter(a => a.tipo === 'nota')
        .map(a => a.descripcion)
        .join('\n');
    if (reunion) {
        reunion.notas_adicionales = notasExistentes;
    }

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

            <div class="form-section">
                <h4>6. Notas Adicionales</h4>
                <div class="form-group">
                    <label>Notas o comentarios adicionales sobre la reunión</label>
                    <textarea name="notas_adicionales" placeholder="Añade cualquier nota, observación o comentario relevante que no encaje en las secciones anteriores...">${reunion?.notas_adicionales || ''}</textarea>
                </div>
            </div>

            <div class="form-section">
                <h4>7. Anexos</h4>
                <p style="font-size: 0.9em; color: #666; margin-bottom: 1rem;">Adjunta documentos y fotografías relacionados con la reunión.</p>
                <div class="form-row">
                    <div class="form-group">
                        <label>📄 Documentos (PDF, DOC, XLS...)</label>
                        <input type="file" name="documentos" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt">
                    </div>
                    <div class="form-group">
                        <label>📷 Fotografías</label>
                        <input type="file" name="fotografias" multiple accept="image/*">
                    </div>
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
        },
        notas_adicionales: formData.get('notas_adicionales')
    };

    try {
        let savedReunionId = reunionId;

        if (reunionId) {
            await api(`/reuniones/${reunionId}`, { method: 'PUT', body: JSON.stringify(data) });
            showToast('Reunión actualizada', 'success');
        } else {
            const result = await api('/reuniones', { method: 'POST', body: JSON.stringify(data) });
            savedReunionId = result.id;
            showToast('Reunión creada', 'success');
        }

        // Subir anexos si hay archivos seleccionados
        const documentos = form.querySelector('input[name="documentos"]')?.files || [];
        const fotografias = form.querySelector('input[name="fotografias"]')?.files || [];

        if (documentos.length > 0 || fotografias.length > 0) {
            const anexosFormData = new FormData();

            for (const file of documentos) {
                anexosFormData.append('documentos', file);
            }
            for (const file of fotografias) {
                anexosFormData.append('fotografias', file);
            }

            try {
                const response = await fetch(`/api/reuniones/${savedReunionId}/anexos`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${App.token}`
                    },
                    body: anexosFormData
                });

                if (!response.ok) {
                    const error = await response.json();
                    console.error('Error subiendo anexos:', error);
                    showToast('Reunión guardada, pero hubo un error al subir los anexos', 'warning');
                } else {
                    showToast('Anexos subidos correctamente', 'success');
                }
            } catch (e) {
                console.error('Error subiendo anexos:', e);
                showToast('Reunión guardada, pero hubo un error al subir los anexos', 'warning');
            }
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
                <p><strong>Cliente:</strong> ${reunion.cliente?.empresa} ${reunion.cliente?.cif ? `(CIF: ${reunion.cliente.cif})` : ''}</p>
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
                <div id="anexos-list">
                    ${(reunion.anexos || []).map(a => `
                        <div class="anexo-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 6px; margin-bottom: 6px;">
                            <span>📎 ${a.nombre_archivo || a.descripcion} <small>(${a.tipo})</small></span>
                            <button class="btn btn-small btn-danger" onclick="deleteAnexo(${id}, ${a.id})">Eliminar</button>
                        </div>
                    `).join('') || '<p>Sin anexos</p>'}
                </div>
                <div style="margin-top: 15px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <h5 style="margin-bottom: 10px;">Subir nuevos anexos</h5>
                    <div class="form-row" style="gap: 10px;">
                        <div class="form-group">
                            <label>Documentos (PDF, DOC, XLS...)</label>
                            <input type="file" id="anexo-docs" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx">
                        </div>
                        <div class="form-group">
                            <label>Fotografías</label>
                            <input type="file" id="anexo-fotos" multiple accept="image/*">
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="uploadAnexos(${id})" style="margin-top: 10px;">📤 Subir Anexos</button>
                </div>
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

// Función para subir anexos
async function uploadAnexos(reunionId) {
    const docsInput = document.getElementById('anexo-docs');
    const fotosInput = document.getElementById('anexo-fotos');

    const formData = new FormData();

    if (docsInput.files.length === 0 && fotosInput.files.length === 0) {
        showToast('Selecciona al menos un archivo', 'warning');
        return;
    }

    for (const file of docsInput.files) {
        formData.append('documentos', file);
    }
    for (const file of fotosInput.files) {
        formData.append('fotografias', file);
    }

    try {
        const response = await fetch(`${API_BASE}/reuniones/${reunionId}/anexos`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${App.token}`
            },
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error al subir anexos');
        }

        showToast('Anexos subidos correctamente', 'success');
        viewReunion(reunionId); // Recargar la vista
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Función para eliminar anexo
async function deleteAnexo(reunionId, anexoId) {
    if (!confirm('¿Estás seguro de eliminar este anexo?')) return;

    try {
        await api(`/reuniones/${reunionId}/anexos/${anexoId}`, { method: 'DELETE' });
        showToast('Anexo eliminado', 'success');
        viewReunion(reunionId); // Recargar la vista
    } catch (error) {
        showToast('Error al eliminar anexo', 'error');
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
                        <option value="tecnico" ${usuario?.rol === 'tecnico' ? 'selected' : ''}>Usuario</option>
                        <option value="admin" ${usuario?.rol === 'admin' ? 'selected' : ''}>Administrador</option>
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
// Comunidad
// ================================
async function loadComunidad() {
    try {
        const recibidos = await api('/compartir/recibidos');
        renderCompartidosRecibidos(recibidos);
    } catch (error) {
        console.error('Error al cargar comunidad:', error);
    }
}

function renderCompartidosRecibidos(data) {
    const container = document.getElementById('compartidos-recibidos');
    const items = [];

    if (data.clientes && data.clientes.length > 0) {
        for (const c of data.clientes) {
            items.push(`
                <div class="data-card shared-card">
                    <div class="card-header">
                        <h3>🏢 ${c.empresa}</h3>
                        <div class="card-actions">
                            <span class="badge badge-shared">Compartido por @${c.compartido_por_username}</span>
                            <button class="btn btn-ghost btn-small" onclick="viewCliente(${c.id})">Ver</button>
                            <button class="btn btn-ghost btn-small btn-danger" onclick="eliminarCompartido(${c.compartido_id})">✖</button>
                        </div>
                    </div>
                    <div class="card-body">
                        <p><strong>Contacto:</strong> ${c.persona_contacto}</p>
                        <p><strong>Ubicación:</strong> ${c.ubicacion || '-'}</p>
                    </div>
                </div>
            `);
        }
    }

    if (data.reuniones && data.reuniones.length > 0) {
        for (const r of data.reuniones) {
            items.push(`
                <div class="data-card shared-card">
                    <div class="card-header">
                        <h3>📋 ${r.codigo_referencia}</h3>
                        <div class="card-actions">
                            <span class="badge badge-shared">Compartido por @${r.compartido_por_username}</span>
                            <button class="btn btn-ghost btn-small" onclick="viewReunion(${r.id})">Ver</button>
                            <button class="btn btn-ghost btn-small btn-danger" onclick="eliminarCompartido(${r.compartido_id})">✖</button>
                        </div>
                    </div>
                    <div class="card-body">
                        <p><strong>Cliente:</strong> ${r.cliente_empresa}</p>
                        <p><strong>Fecha:</strong> ${formatDateTime(r.fecha_hora)}</p>
                        <p><strong>Motivo:</strong> ${r.motivo || '-'}</p>
                    </div>
                </div>
            `);
        }
    }

    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Nadie ha compartido contigo todavía</p></div>';
    } else {
        container.innerHTML = items.join('');
    }
}

let searchTimeout;
function searchUsuariosComunidad(query) {
    clearTimeout(searchTimeout);
    const container = document.getElementById('search-results-comunidad');

    if (!query || query.length < 2) {
        container.innerHTML = '<div class="empty-state"><p>Escribe al menos 2 caracteres para buscar</p></div>';
        return;
    }

    searchTimeout = setTimeout(async () => {
        try {
            const users = await api(`/compartir/buscar/${encodeURIComponent(query)}`);
            if (users.length === 0) {
                container.innerHTML = '<div class="empty-state"><p>No se encontraron usuarios</p></div>';
                return;
            }

            container.innerHTML = users.map(u => `
                <div class="data-card user-card">
                    <div class="card-header">
                        <h3>${u.nombre}</h3>
                        <div class="card-actions">
                            ${u.perfil_publico
                    ? `<span class="badge badge-public">🌐 Público</span>
                                   <button class="btn btn-ghost btn-small" onclick="viewPerfilPublico('${u.username}')">Ver Perfil</button>`
                    : '<span class="badge badge-private">🔒 Privado</span>'
                }
                        </div>
                    </div>
                    <div class="card-body">
                        <p><strong>Username:</strong> @${u.username || 'sin configurar'}</p>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            container.innerHTML = '<div class="empty-state"><p>Error al buscar</p></div>';
        }
    }, 300);
}

async function viewPerfilPublico(username) {
    try {
        const perfil = await api(`/compartir/perfil/${username}`);

        let html = `
            <div class="perfil-publico">
                <div class="perfil-header">
                    <h2>👤 ${perfil.nombre}</h2>
                    <span class="badge badge-public">@${perfil.username}</span>
                </div>
        `;

        // Clientes públicos
        html += '<h3>🏢 Clientes Públicos</h3>';
        if (perfil.clientes.length > 0) {
            html += '<div class="perfil-items">';
            for (const c of perfil.clientes) {
                html += `
                    <div class="perfil-item">
                        <strong>${c.empresa}</strong> - ${c.persona_contacto}
                        ${c.ubicacion ? `<br><small>📍 ${c.ubicacion}</small>` : ''}
                    </div>
                `;
            }
            html += '</div>';
        } else {
            html += '<p class="text-muted">Sin clientes públicos</p>';
        }

        // Reuniones públicas
        html += '<h3>📋 Informes de Reuniones Públicos</h3>';
        if (perfil.reuniones.length > 0) {
            html += '<div class="perfil-items">';
            for (const r of perfil.reuniones) {
                html += `
                    <div class="perfil-item perfil-item-reunion">
                        <div class="perfil-item-info">
                            <strong>${r.codigo_referencia}</strong> - ${r.cliente_empresa}
                            <br><small>📅 ${formatDateTime(r.fecha_hora)} ${r.lugar ? '| 📍 ' + r.lugar : ''}</small>
                        </div>
                        <a href="${API_BASE}/compartir/perfil/${username}/reunion/${r.id}/pdf" class="btn btn-small btn-primary" target="_blank">📄 PDF</a>
                    </div>
                `;
            }
            html += '</div>';
        } else {
            html += '<p class="text-muted">Sin reuniones públicas</p>';
        }

        html += '</div>';

        elements.modalTitle.textContent = `Perfil de @${username}`;
        elements.modalBody.innerHTML = html;
        openModal();
    } catch (error) {
        showToast(error.message || 'Error al ver perfil', 'error');
    }
}

async function openPerfilConfig() {
    try {
        const perfil = await api('/compartir/mi-perfil');

        elements.modalTitle.textContent = '⚙️ Configurar Mi Perfil';
        elements.modalBody.innerHTML = `
            <form id="perfil-form">
                <div class="form-group">
                    <label>Nombre de Usuario (@username)</label>
                    <input type="text" id="perfil-username" value="${perfil.username || ''}" placeholder="mi_usuario" 
                           pattern="[a-z0-9._-]{3,}" title="Mínimo 3 caracteres, solo letras minúsculas, números, puntos, guiones">
                    <small>Solo letras, números, puntos y guiones. Mínimo 3 caracteres.</small>
                </div>
                <div class="form-group">
                    <label class="toggle-label">
                        <input type="checkbox" id="perfil-publico" ${perfil.perfil_publico ? 'checked' : ''}>
                        <span>🌐 Perfil Público</span>
                    </label>
                    <small>Si activas esto, otros usuarios podrán ver tus clientes y reuniones al buscar tu @username.</small>
                </div>
                <button type="submit" class="btn btn-primary btn-full">Guardar Perfil</button>
            </form>
        `;

        document.getElementById('perfil-form').onsubmit = async (e) => {
            e.preventDefault();
            try {
                await api('/compartir/mi-perfil', {
                    method: 'PUT',
                    body: JSON.stringify({
                        username: document.getElementById('perfil-username').value,
                        perfil_publico: document.getElementById('perfil-publico').checked
                    })
                });
                showToast('Perfil actualizado correctamente', 'success');
                closeModal();
            } catch (error) {
                showToast(error.message || 'Error al guardar', 'error');
            }
        };

        openModal();
    } catch (error) {
        showToast('Error al cargar perfil', 'error');
    }
}

function openCompartirDialog(tipo, recursoId, nombre) {
    elements.modalTitle.textContent = `🔗 Compartir ${tipo === 'cliente' ? 'Cliente' : 'Reunión'}`;
    elements.modalBody.innerHTML = `
        <div class="compartir-dialog">
            <p>Compartir <strong>${nombre}</strong> con otro usuario:</p>
            <form id="compartir-form">
                <div class="form-group">
                    <label>@username del destinatario</label>
                    <input type="text" id="compartir-username" placeholder="@usuario" required>
                </div>
                <button type="submit" class="btn btn-primary btn-full">Compartir</button>
            </form>
        </div>
    `;

    document.getElementById('compartir-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
            const username = document.getElementById('compartir-username').value.replace('@', '').trim();
            const result = await api('/compartir', {
                method: 'POST',
                body: JSON.stringify({
                    tipo,
                    recurso_id: recursoId,
                    username_destino: username
                })
            });
            showToast(result.message, 'success');
            closeModal();
        } catch (error) {
            showToast(error.message || 'Error al compartir', 'error');
        }
    };

    openModal();
}

async function eliminarCompartido(id) {
    if (!confirm('¿Dejar de ver este contenido compartido?')) return;
    try {
        await api(`/compartir/${id}`, { method: 'DELETE' });
        showToast('Compartido eliminado', 'success');
        loadComunidad();
    } catch (error) {
        showToast('Error al eliminar compartido', 'error');
    }
}

async function toggleVisibilidad(tipo, id, publico) {
    try {
        await api(`/${tipo}/${id}/visibilidad`, {
            method: 'PUT',
            body: JSON.stringify({ publico })
        });
        showToast(publico ? 'Marcado como público 🌐' : 'Marcado como privado 🔒', 'success');
        // Recargar la vista actual
        if (tipo === 'clientes') loadClientes();
        else loadReuniones();
    } catch (error) {
        showToast('Error al cambiar visibilidad', 'error');
    }
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
