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
                    // ✅ CORRECCIÓN AQUÍ: Agregamos correo_destino y asunto_correo
                    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_SECRETARIA, {
                        nombre: nombre, 
                        correo: correo, 
                        dni: dni, 
                        tipo: tipo, 
                        asunto: asunto,
                        expediente: numeroExpediente,
                        pdf_url: archivoUrl,
                        fecha: fechaEnvio,
                        correo_destino: 'mesadepartesiejo80829@gmail.com', 
                        asunto_correo: `🔔 NUEVO TRÁMITE: Expediente ${numeroExpediente} - ${nombre}`
                    }),
                    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_CIUDADANO, {
                        nombre: nombre, 
                        correo: correo, 
                        tipo: tipo, 
                        asunto: asunto,
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

            let botonCorregir = '';
            if (data.estado === "RECIBIDO") {
                botonCorregir = `
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e0e6ed; text-align: center;">
                        <p style="font-size: 0.85rem; color: #666; margin-bottom: 10px;">¿Subiste un archivo equivocado?</p>
                        <button onclick="abrirModalCorregir('${data.numero_expediente}')" style="background: #f59e0b; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: all 0.3s;" onmouseover="this.style.background='#d97706'" onmouseout="this.style.background='#f59e0b'">
                            ⚠️ Reemplazar Archivo PDF
                        </button>
                    </div>
                `;
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
                        <p>📎 <strong>Documento adjunto:</strong> <a href="${data.archivo_url}" target="_blank" style="color: #1a5fa8;">Ver PDF Actual</a></p>
                    </div>
                    ${botonCorregir}
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
// NUEVO BLOQUE: LÓGICA PARA REEMPLAZAR ARCHIVO
// ============================================

function abrirModalCorregir(numeroExpediente) {
    const modal = document.createElement('div');
    modal.id = 'modalCorregir';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(5px);
        display: flex; justify-content: center; align-items: center; z-index: 9999;
    `;

    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 12px; max-width: 450px; width: 90%; box-shadow: 0 10px 30px rgba(0,0,0,0.3); animation: popIn 0.4s ease-out;">
            <h3 style="color: #1e3a8a; margin-top: 0; text-align: center;">Reemplazar Documento</h3>
            <p style="text-align: center; color: #666; font-size: 0.9rem; margin-bottom: 20px;">Expediente: <strong>${numeroExpediente}</strong></p>
            
            <label style="display: block; font-weight: bold; margin-bottom: 8px;">Seleccione el nuevo PDF:</label>
            <input type="file" id="nuevoArchivo" accept=".pdf" style="width: 100%; padding: 10px; border: 2px dashed #3b82f6; border-radius: 8px; margin-bottom: 20px; cursor: pointer;">
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="cerrarModalCorregir()" style="background: #ccc; color: #333; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;">Cancelar</button>
                <button onclick="subirNuevoArchivo('${numeroExpediente}')" id="btnSubirNuevo" style="background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;">Subir Corrección</button>
            </div>
        </div>
    `;

    const style = document.createElement('style');
    style.innerHTML = `@keyframes popIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }`;
    document.head.appendChild(style);

    document.body.appendChild(modal);
}

function cerrarModalCorregir() {
    const modal = document.getElementById('modalCorregir');
    if (modal) modal.remove();
}

async function subirNuevoArchivo(numeroExpediente) {
    const input = document.getElementById('nuevoArchivo');
    const archivo = input.files[0];
    const btn = document.getElementById('btnSubirNuevo');

    if (!archivo) {
        alert("Por favor, seleccione un archivo PDF.");
        return;
    }

    if (archivo.type !== 'application/pdf') {
        alert("El archivo debe ser un PDF.");
        return;
    }

    btn.innerHTML = '⏳ Subiendo...';
    btn.disabled = true;

    try {
        const nombreLimpio = archivo.name.replace(/\s+/g, '_');
        const nombreArchivo = `${numeroExpediente}_CORREGIDO_${nombreLimpio}`;
        
        const { error: uploadError } = await supabaseClient
            .storage.from('documentos')
            .upload(nombreArchivo, archivo, { upsert: true });

        if (uploadError) throw new Error("Error al subir el PDF: " + uploadError.message);

        const { data: urlData } = supabaseClient
            .storage.from('documentos').getPublicUrl(nombreArchivo);

        const { error: updateError } = await supabaseClient
            .from('expedientes')
            .update({ archivo_url: urlData.publicUrl })
            .eq('numero_expediente', numeroExpediente);

        if (updateError) throw updateError;

        alert("✅ ¡Archivo reemplazado con éxito!\n\nYa puede ver el nuevo documento en su seguimiento.");
        
        cerrarModalCorregir();
        document.getElementById("btnConsultar").click(); 

    } catch (error) {
        console.error("Error:", error);
        alert("❌ Error al reemplazar el archivo: " + error.message);
    } finally {
        btn.innerHTML = 'Subir Corrección';
        btn.disabled = false;
    }
}