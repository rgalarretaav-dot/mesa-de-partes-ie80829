// ============================================
// CONFIGURACIÓN DE SUPABASE
// ============================================
const SUPABASE_URL = 'https://bjqglpoixyexekpiviti.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eHgu4robG0UZBk5VqtaPug_V8gJnq4X';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// CONFIGURACIÓN DE EMAILJS
// ============================================
const EMAILJS_SERVICE_ID = 'service_ps8ulbf';
const EMAILJS_TEMPLATE_SECRETARIA = 'template_85jctsk';
const EMAILJS_TEMPLATE_CIUDADANO = 'template_iws1hbe';
const EMAILJS_PUBLIC_KEY = 'ny8tDzLyRbs06EHLo';

emailjs.init(EMAILJS_PUBLIC_KEY);

// ============================================
// BLOQUE 1: REGISTRO DE EXPEDIENTES (Mesa de Partes)
// ============================================
document.addEventListener("DOMContentLoaded", function() {
    
    const tarjetas = document.querySelectorAll(".tarjeta");
    tarjetas.forEach(function(tarjeta, index) {
        tarjeta.style.opacity = "0";
        tarjeta.style.transform = "translateY(20px)";
        setTimeout(function() {
            tarjeta.style.transition = "all 0.5s ease";
            tarjeta.style.opacity = "1";
            tarjeta.style.transform = "translateY(0)";
        }, index * 150);
    });

    const formRegistro = document.getElementById("formRegistro");
    if (!formRegistro) return;

    formRegistro.addEventListener("submit", async function(e) {
        e.preventDefault(); 

        const nombre = document.getElementById("nombre").value;
        const dni = document.getElementById("dni").value;
        const telefono = document.getElementById("telefono").value;
        const correo = document.getElementById("correo").value;
        const tipo = document.getElementById("tipo").value;
        const asunto = document.getElementById("asunto").value;
        const folios = document.getElementById("folios").value;
        const archivoInput = document.getElementById("archivo");
        const archivo = archivoInput.files[0];

        const btnEnviar = formRegistro.querySelector(".btn-enviar");
        const textoOriginal = btnEnviar.innerHTML;
        btnEnviar.innerHTML = "⏳ Procesando...";
        btnEnviar.disabled = true;

        try {
            const year = new Date().getFullYear();
            
            const { data: ultimos } = await supabaseClient
                .from('expedientes')
                .select('numero_expediente')
                .like('numero_expediente', `${year}-%`)
                .order('numero_expediente', { ascending: false })
                .limit(1);

            let nuevoNumero = 1;
            if (ultimos && ultimos.length > 0) {
                nuevoNumero = parseInt(ultimos[0].numero_expediente.split('-')[1]) + 1;
            }
            const numeroExpediente = `${year}-${String(nuevoNumero).padStart(4, '0')}`;

            let archivoUrl = "";
            if (archivo) {
                const nombreLimpio = archivo.name.replace(/\s+/g, '_');
                const nombreArchivo = `${numeroExpediente}_${dni}_${nombreLimpio}`;
                
                const { error: uploadError } = await supabaseClient
                    .storage.from('documentos')
                    .upload(nombreArchivo, archivo, { upsert: true });

                if (uploadError) throw new Error("Error al subir el PDF: " + uploadError.message);

                const { data: urlData } = supabaseClient
                    .storage.from('documentos').getPublicUrl(nombreArchivo);
                archivoUrl = urlData.publicUrl;
            }

            const { error: insertError } = await supabaseClient
                .from('expedientes')
                .insert([{
                    numero_expediente: numeroExpediente,
                    nombre, dni, telefono, correo,
                    tipo_documento: tipo,
                    asunto,
                    folios: folios ? parseInt(folios) : null,
                    archivo_url: archivoUrl,
                    estado: 'RECIBIDO'
                }]);

            if (insertError) throw new Error("Error al guardar: " + insertError.message);

            const fechaEnvio = new Date().toLocaleString('es-PE', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            try {
                await Promise.all([
                    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_SECRETARIA, {
                        nombre, correo, dni, tipo, asunto,
                        expediente: numeroExpediente,
                        pdf_url: archivoUrl,
                        fecha: fechaEnvio,
                        correo_destino: 'mesadepartesiejo80829@gmail.com',
                        asunto_correo: `🔔 NUEVO TRÁMITE: Expediente ${numeroExpediente} - ${nombre}`
                    }),
                    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_CIUDADANO, {
                        nombre, correo, tipo, asunto,
                        expediente: numeroExpediente,
                        fecha: fechaEnvio,
                        asunto_correo: `✅ Expediente ${numeroExpediente} recibido - I.E. 80829`,
                        icono: '📥',
                        titulo: 'Trámite Recibido',
                        mensaje: 'Su documento ha sido RECIBIDO correctamente en la Mesa de Partes Virtual. Pronto será atendido por la secretaría.',
                        bloque_extra: ''
                    })
                ]);
            } catch (emailError) {
                console.error("⚠️ Error al enviar correos:", emailError);
            }

            formRegistro.reset(); 
            alert(`✅ ¡Trámite registrado!\n\nSu número de expediente es: ${numeroExpediente}\n\nRevise su correo personal (también la bandeja de spam).`);

        } catch (error) {
            console.error("Error:", error);
            alert("❌ Error: " + (error.message || error.text || "Desconocido"));
        } finally {
            btnEnviar.innerHTML = textoOriginal;
            btnEnviar.disabled = false;
        }
    });
});

// ============================================
// BLOQUE 2: SEGUIMIENTO DE EXPEDIENTES
// ============================================
document.addEventListener("DOMContentLoaded", function() {
    const btnConsultar = document.getElementById("btnConsultar");
    if (!btnConsultar) return;

    btnConsultar.addEventListener("click", async function() {
        const numeroExpediente = document.getElementById("numeroExpediente").value.trim();
        const resultadoDiv = document.getElementById("resultadoConsulta");

        if (!numeroExpediente) {
            alert("Por favor, ingrese un número de expediente.");
            return;
        }

        btnConsultar.innerHTML = "⏳ Buscando...";
        btnConsultar.disabled = true;
        resultadoDiv.style.display = "none";

        try {
            const { data, error } = await supabaseClient
                .from('expedientes').select('*')
                .eq('numero_expediente', numeroExpediente)
                .single();

            if (error || !data) {
                resultadoDiv.innerHTML = `
                    <div style="background: #fff3cd; padding: 20px; border-radius: 8px; border-left: 5px solid #ffc107;">
                        <h3 style="color: #856404; margin-top: 0;">⚠️ Expediente no encontrado</h3>
                        <p>No existe ningún trámite con el número <strong>${numeroExpediente}</strong>.</p>
                    </div>`;
                resultadoDiv.style.display = "block";
                return;
            }

            const fecha = new Date(data.fecha_recepcion).toLocaleString('es-PE', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            let colorEstado = "#0d3b66";
            if (data.estado === "EN REVISIÓN") colorEstado = "#f08519";
            if (data.estado === "DERIVADO") colorEstado = "#1a5fa8";
            if (data.estado === "ATENDIDO") colorEstado = "#0a7c5c";

            let bloqueRespuesta = '';

            // Si está DERIVADO, mostrar el área
            if (data.estado === "DERIVADO" && data.area_derivada) {
                bloqueRespuesta = `
                    <div style="margin-top: 25px; padding: 20px; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 5px solid #2563eb; border-radius: 10px;">
                        <h4 style="margin: 0 0 12px 0; color: #1e40af; font-size: 1rem;">📤 Trámite Derivado</h4>
                        <p style="margin: 0 0 5px 0; color: #333; font-size: 0.9rem;"><strong>Área:</strong> ${data.area_derivada}</p>
                        ${data.motivo_derivacion ? `<p style="margin: 0; color: #555; font-size: 0.85rem;"><em>${data.motivo_derivacion}</em></p>` : ''}
                    </div>`;
            }

            // Si está ATENDIDO, mostrar respuesta y archivo
            if (data.estado === "ATENDIDO" && (data.respuesta || data.archivo_respuesta_url)) {
                bloqueRespuesta = `
                    <div style="margin-top: 25px; padding: 20px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-left: 5px solid #22c55e; border-radius: 10px;">
                        <h4 style="margin: 0 0 12px 0; color: #166534; font-size: 1rem;">✅ Respuesta de la Institución</h4>
                        ${data.respuesta ? `<p style="margin: 0 0 15px 0; color: #333; font-size: 0.9rem; line-height: 1.6;">${data.respuesta}</p>` : ''}
                        ${data.archivo_respuesta_url ? `
                            <a href="${data.archivo_respuesta_url}" target="_blank" style="display: inline-block; background: #16a34a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 0.85rem;">
                                📎 Descargar PDF de Respuesta
                            </a>` : ''}
                    </div>`;
            }

            resultadoDiv.innerHTML = `
                <div style="background: white; border: 2px solid #e0e6ed; border-radius: 12px; padding: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f0f4f8; padding-bottom: 15px; margin-bottom: 20px;">
                        <h3 style="color: #0d3b66; margin: 0; font-size: 1.2rem;">Expediente: ${data.numero_expediente}</h3>
                        <span style="background: ${colorEstado}; color: white; padding: 6px 15px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; text-transform: uppercase;">${data.estado}</span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 0.9rem;">
                        <div><strong>Solicitante:</strong><br>${data.nombre}</div>
                        <div><strong>DNI:</strong><br>${data.dni}</div>
                        <div><strong>Fecha de Recepción:</strong><br>${fecha}</div>
                        <div><strong>Tipo de Documento:</strong><br>${data.tipo_documento}</div>
                        <div style="grid-column: span 2;"><strong>Asunto:</strong><br>${data.asunto}</div>
                    </div>
                    <div style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed #e0e6ed; font-size: 0.85rem; color: #666;">
                        <p>📎 <strong>Documento adjunto:</strong> <a href="${data.archivo_url}" target="_blank" style="color: #1a5fa8;">Ver PDF</a></p>
                    </div>
                    ${bloqueRespuesta}
                </div>`;
            resultadoDiv.style.display = "block";

        } catch (error) {
            console.error("Error:", error);
            alert("❌ Error al consultar. Intente de nuevo.");
        } finally {
            btnConsultar.innerHTML = "🔍 Consultar Estado";
            btnConsultar.disabled = false;
        }
    });
});

// ============================================
// BLOQUE 3: REGISTRO DE RECLAMACIONES (Libro de Reclamaciones Virtual)
// ============================================
document.addEventListener("DOMContentLoaded", function() {
    const formReclamacion = document.getElementById("formReclamacion");
    if (!formReclamacion) return;

    formReclamacion.addEventListener("submit", async function(e) {
        e.preventDefault();

        const btn = formReclamacion.querySelector(".btn-enviar-reclamo");
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = "⏳ Procesando...";
        btn.disabled = true;

        try {
            const year = new Date().getFullYear();
            const { data: ultimos } = await supabaseClient
                .from('reclamaciones')
                .select('codigo_reclamacion')
                .like('codigo_reclamacion', `REC-${year}-%`)
                .order('codigo_reclamacion', { ascending: false })
                .limit(1);

            let nuevoNumero = 1;
            if (ultimos && ultimos.length > 0) {
                nuevoNumero = parseInt(ultimos[0].codigo_reclamacion.split('-')[2]) + 1;
            }
            const codigoReclamacion = `REC-${year}-${String(nuevoNumero).padStart(4, '0')}`;

            const datos = {
                codigo_reclamacion: codigoReclamacion,
                nombre_consumidor: document.getElementById("nombre_consumidor").value,
                tipo_documento: document.getElementById("tipo_documento").value,
                numero_documento: document.getElementById("numero_documento").value,
                domicilio: document.getElementById("domicilio").value || null,
                telefono: document.getElementById("telefono").value || null,
                correo: document.getElementById("correo").value,
                nombre_representante: document.getElementById("nombre_representante")?.value || null,
                documento_representante: document.getElementById("documento_representante")?.value || null,
                tipo_bien: document.getElementById("tipo_bien").value,
                descripcion_bien: document.getElementById("descripcion_bien").value,
                monto_reclamado: parseFloat(document.getElementById("monto_reclamado").value) || null,
                tipo_reclamacion: document.getElementById("tipo_reclamacion").value,
                detalle_reclamacion: document.getElementById("detalle_reclamacion").value,
                pedido_consumidor: document.getElementById("pedido_consumidor").value,
                estado: 'PENDIENTE'
            };

            const { error: insertError } = await supabaseClient
                .from('reclamaciones').insert([datos]);

            if (insertError) throw new Error("Error al guardar: " + insertError.message);

            const fechaEnvio = new Date().toLocaleString('es-PE', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            try {
                await Promise.all([
                    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_SECRETARIA, {
                        nombre: datos.nombre_consumidor,
                        correo: datos.correo,
                        dni: datos.numero_documento,
                        tipo: datos.tipo_reclamacion === 'RECLAMO' ? 'Reclamo' : 'Queja',
                        asunto: datos.descripcion_bien,
                        expediente: codigoReclamacion,
                        pdf_url: '#',
                        fecha: fechaEnvio,
                        correo_destino: 'mesadepartesiejo80829@gmail.com',
                        asunto_correo: `📋 NUEVO RECLAMO: ${codigoReclamacion} - ${datos.nombre_consumidor}`
                    }),
                    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_CIUDADANO, {
                        nombre: datos.nombre_consumidor,
                        correo: datos.correo,
                        tipo: datos.tipo_reclamacion,
                        asunto: datos.descripcion_bien,
                        expediente: codigoReclamacion,
                        fecha: fechaEnvio,
                        asunto_correo: `📋 Reclamo ${codigoReclamacion} recibido - I.E. 80829`,
                        icono: '📋',
                        titulo: 'Reclamo Recibido',
                        mensaje: 'Su reclamo o queja ha sido registrado correctamente. Será atendido en un plazo máximo de 30 días calendario.',
                        bloque_extra: ''
                    })
                ]);
            } catch (emailError) {
                console.error("⚠️ Error al enviar correos:", emailError);
            }

            formReclamacion.reset();
            alert(`✅ ¡Reclamo registrado con éxito!\n\nSu código es: ${codigoReclamacion}\n\nRecibirá una confirmación en su correo.`);

        } catch (error) {
            console.error("Error:", error);
            alert("❌ Error: " + (error.message || "Desconocido"));
        } finally {
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        }
    });
});

// ============================================
// BLOQUE 4: SEGUIMIENTO DE RECLAMACIONES
// ============================================
document.addEventListener("DOMContentLoaded", function() {
    const btnConsultarReclamo = document.getElementById("btnConsultarReclamo");
    if (!btnConsultarReclamo) return;

    btnConsultarReclamo.addEventListener("click", async function() {
        const codigo = document.getElementById("codigoReclamacion").value.trim();
        const resultadoDiv = document.getElementById("resultadoReclamacion");

        if (!codigo) {
            alert("Por favor, ingrese su código de reclamación.");
            return;
        }

        btnConsultarReclamo.innerHTML = "⏳ Buscando...";
        btnConsultarReclamo.disabled = true;
        resultadoDiv.style.display = "none";

        try {
            const { data, error } = await supabaseClient
                .from('reclamaciones').select('*')
                .eq('codigo_reclamacion', codigo)
                .single();

            if (error || !data) {
                resultadoDiv.innerHTML = `
                    <div style="background: #fff3cd; padding: 20px; border-radius: 8px; border-left: 5px solid #ffc107;">
                        <h3 style="color: #856404; margin-top: 0;">⚠️ Reclamo no encontrado</h3>
                        <p>No existe un reclamo con el código <strong>${codigo}</strong>.</p>
                    </div>`;
                resultadoDiv.style.display = "block";
                return;
            }

            const fecha = new Date(data.fecha_reclamacion).toLocaleString('es-PE', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            let colorEstado = "#f08519";
            let textoEstado = data.estado;
            if (data.estado === "EN_PROCESO") { colorEstado = "#1a5fa8"; textoEstado = "EN PROCESO"; }
            if (data.estado === "ATENDIDO") { colorEstado = "#0a7c5c"; }

            const bloqueRespuesta = (data.estado === "ATENDIDO" && (data.observaciones_proveedor || data.archivo_respuesta_url)) ? `
                <div style="margin-top: 25px; padding: 20px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-left: 5px solid #22c55e; border-radius: 10px;">
                    <h4 style="margin: 0 0 12px 0; color: #166534; font-size: 1rem;">✅ Respuesta de la Institución</h4>
                    ${data.observaciones_proveedor ? `<p style="margin: 0 0 15px 0; color: #333; font-size: 0.9rem; line-height: 1.6;">${data.observaciones_proveedor}</p>` : ''}
                    ${data.archivo_respuesta_url ? `
                        <a href="${data.archivo_respuesta_url}" target="_blank" style="display: inline-block; background: #16a34a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 0.85rem;">
                            📎 Descargar Documento de Respuesta
                        </a>` : ''}
                </div>` : '';

            resultadoDiv.innerHTML = `
                <div style="background: white; border: 2px solid #e0e6ed; border-radius: 12px; padding: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f0f4f8; padding-bottom: 15px; margin-bottom: 20px;">
                        <h3 style="color: #0d3b66; margin: 0; font-size: 1.2rem;">Reclamo: ${data.codigo_reclamacion}</h3>
                        <span style="background: ${colorEstado}; color: white; padding: 6px 15px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; text-transform: uppercase;">${textoEstado}</span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 0.9rem;">
                        <div><strong>Consumidor:</strong><br>${data.nombre_consumidor}</div>
                        <div><strong>Documento:</strong><br>${data.tipo_documento} ${data.numero_documento}</div>
                        <div><strong>Fecha:</strong><br>${fecha}</div>
                        <div><strong>Tipo:</strong><br>${data.tipo_reclamacion}</div>
                        <div style="grid-column: span 2;"><strong>Bien contratado:</strong><br>${data.descripcion_bien}</div>
                        <div style="grid-column: span 2;"><strong>Detalle:</strong><br>${data.detalle_reclamacion}</div>
                        <div style="grid-column: span 2;"><strong>Pedido:</strong><br>${data.pedido_consumidor}</div>
                    </div>
                    ${bloqueRespuesta}
                </div>`;
            resultadoDiv.style.display = "block";

        } catch (error) {
            console.error("Error:", error);
            alert("❌ Error al consultar. Intente de nuevo.");
        } finally {
            btnConsultarReclamo.innerHTML = "🔍 Consultar Reclamo";
            btnConsultarReclamo.disabled = false;
        }
    });
});