const btnTiempo = document.getElementById('btnTiempo')
const formCiudad = document.getElementById('formCiudad')
const ciudad = document.getElementById('ciudad')
const mensaje = document.getElementById('mensaje')
const resultado = document.getElementById('resultado')
let consultaActual = 0
let lugarActual = null
const guardarFavorita = document.getElementById('guardarFavorita')
const listaFavoritas = document.getElementById('listaFavoritas')
const mensajeFavoritas = document.getElementById('mensajeFavoritas')
const claveFavoritas = 'brisa.favoritas.v1'
let favoritas = leerFavoritas()
renderizarFavoritas()

function iniciarConsulta() {
    btnTiempo.disabled = true
    resultado.setAttribute('aria-busy', 'true')
    return ++consultaActual
}

function terminarConsulta(id) {
    if (id !== consultaActual) return
    btnTiempo.disabled = false
    resultado.setAttribute('aria-busy', 'false')
}

btnTiempo.addEventListener('click', () => {
	if (!navigator.geolocation) {
		mostrarError('Tu navegador no permite obtener la ubicación.')
		return
	}

	const consulta = iniciarConsulta()
	mensaje.textContent = 'Buscando tu ubicación...'

	navigator.geolocation.getCurrentPosition((posicion) => {
		const lat = posicion.coords.latitude
		const lon = posicion.coords.longitude
		if (consulta !== consultaActual) return
		const url = crearUrlTiempo(lat, lon)

		mensaje.textContent = 'Ubicación encontrada. Consultando el cielo...'

		fetch(url)
			.then(respuesta => {
				if (!respuesta.ok) throw new Error('No se ha podido consultar la API.')
				return respuesta.json()
			})
			.then(datos => { if (consulta === consultaActual) mostrarTiempo(datos, 'Tu ubicación actual', null) })
			.catch(error => { if (consulta === consultaActual) mostrarError(error.message) })
			.finally(() => terminarConsulta(consulta))
	}, () => {
		if (consulta !== consultaActual) return
		terminarConsulta(consulta)
		mostrarError('No hemos podido acceder a tu ubicación. Revisa los permisos del navegador.')
	}, { timeout: 15000, maximumAge: 300000 })
})

formCiudad.addEventListener('submit', (evento) => {
	evento.preventDefault()
	const nombreCiudad = ciudad.value.trim()
	if (!nombreCiudad) return

	const consulta = iniciarConsulta()
	mensaje.textContent = `Buscando ${nombreCiudad}...`
	const urlCiudad = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nombreCiudad)}&count=1&language=es&format=json`

	fetch(urlCiudad)
		.then(respuesta => {
			if (!respuesta.ok) throw new Error('No se ha podido buscar esa ciudad.')
			return respuesta.json()
		})
		.then(datosCiudad => {
			if (!datosCiudad.results || datosCiudad.results.length === 0) throw new Error('No hemos encontrado esa ciudad.')
			if (consulta !== consultaActual) return
			const lugar = datosCiudad.results[0]
			const urlTiempo = crearUrlTiempo(lugar.latitude, lugar.longitude)
			mensaje.textContent = `Consultando el tiempo de ${lugar.name}...`
			return fetch(urlTiempo).then(respuesta => {
				if (!respuesta.ok) throw new Error('No se ha podido consultar el tiempo.')
				return respuesta.json()
			}).then(datos => { if (consulta === consultaActual) mostrarTiempo(datos, [lugar.name, lugar.country].filter(Boolean).join(', '), { nombre: lugar.name, region: [lugar.admin1, lugar.country].filter(Boolean).join(', '), lat: lugar.latitude, lon: lugar.longitude }) })
		})
		.catch(error => { if (consulta === consultaActual) mostrarError(error.message) })
		.finally(() => terminarConsulta(consulta))
})

function crearUrlTiempo(lat, lon) {
	return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m&hourly=temperature_2m&forecast_days=2&wind_speed_unit=kmh&timezone=auto`
}

function mostrarTiempo(datos, nombreLugar, lugar = null) {
	const actual = datos.current
	const unidad = datos.current_units
	if (!actual || !Number.isFinite(actual.temperature_2m)) throw new Error('No hay temperatura disponible para esta ubicación.')
    const inicio = datos.hourly.time.findIndex(hora => hora >= actual.time)
    const horas = inicio < 0 ? [] : datos.hourly.time.slice(inicio, inicio + 4)
    const temperaturas = inicio < 0 ? [] : datos.hourly.temperature_2m.slice(inicio, inicio + 4)
	const ahora = new Date(actual.time.slice(0, 10) + 'T12:00:00Z')
	const nombreDia = ahora.toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'UTC' })
	const fecha = ahora.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })
	const estado = obtenerEstado(actual.weather_code)
    const ventoso = actual.wind_speed_10m >= 25 || actual.wind_gusts_10m >= 40
    const descripcion = estado.descripcion + (ventoso ? ' · Viento fuerte' : '')
    actualizarCielo(actual, estado, ventoso)
    document.getElementById('tituloPrincipal').textContent = nombreLugar
    const temperaturaPrincipal = document.getElementById('temperaturaPrincipal')
    temperaturaPrincipal.hidden = false
    temperaturaPrincipal.textContent = Math.round(actual.temperature_2m) + '°'
    document.getElementById('descripcionPrincipal').textContent = descripcion + ' · ' + (actual.is_day === 1 ? 'De día' : 'De noche')
    lugarActual = lugar
    actualizarBotonFavorita()
    nombreLugar = escaparHTML(nombreLugar)

	mensaje.textContent = `Últimos datos: ${formatearHora(actual.time)} · Hora local de la ubicación`
	resultado.innerHTML = `
		<div class="weather-heading">
			<div><p class="place-label">Tiempo en</p><h2 class="place-name">${nombreLugar}</h2></div>
			<p class="date-label">${capitalizar(nombreDia)}, ${fecha}</p>
		</div>
		<div class="current-weather">
			<div><p class="temperature">${Math.round(actual.temperature_2m)}<sup>${unidad.temperature_2m}</sup></p><p class="weather-description">${descripcion}</p></div>
			<div class="metrics">
				<div class="metric"><span class="metric-label">Sensación</span><span class="metric-value">${Math.round(actual.apparent_temperature)}${unidad.apparent_temperature}</span></div>
				<div class="metric"><span class="metric-label">Humedad</span><span class="metric-value">${actual.relative_humidity_2m}${unidad.relative_humidity_2m}</span></div>
				<div class="metric"><span class="metric-label">Viento</span><span class="metric-value">${Math.round(actual.wind_speed_10m)} ${unidad.wind_speed_10m}</span></div>
				<div class="metric"><span class="metric-label">Dirección</span><span class="metric-value">${actual.wind_direction_10m}°</span></div>
			</div>
		</div>
		<div class="forecast-title"><h2>Próximas horas</h2><span>Temperatura</span></div>
		<div class="forecast-list">${horas.map((hora, indice) => `<div class="forecast-item"><span class="forecast-time">${formatearHora(hora)}</span><span class="forecast-temp">${Math.round(temperaturas[indice])}${unidad.temperature_2m}</span><span class="forecast-dot"></span></div>`).join('')}</div>
	`
}

function formatearHora(hora) { return hora.slice(11, 16) }
function capitalizar(texto) { return texto.charAt(0).toUpperCase() + texto.slice(1) }
function latitudBonita(valor) { return `${Math.abs(valor).toFixed(2)}° ${valor >= 0 ? 'N' : 'S'}` }
function longitudBonita(valor) { return `${Math.abs(valor).toFixed(2)}° ${valor >= 0 ? 'E' : 'O'}` }
function mostrarError(texto) { mensaje.textContent = texto; btnTiempo.disabled = false }

// Códigos WMO de Open-Meteo. El viento se representa como una capa independiente.
function obtenerEstado(codigo) {
    if (codigo === 0) return { tipo: 'clear', descripcion: 'Cielo despejado' }
    if (codigo === 1) return { tipo: 'partly', descripcion: 'Mayormente despejado' }
    if (codigo === 2) return { tipo: 'partly', descripcion: 'Parcialmente nublado' }
    if (codigo === 3) return { tipo: 'cloudy', descripcion: 'Cielo cubierto' }
    if ([45, 48].includes(codigo)) return { tipo: 'fog', descripcion: 'Niebla' }
    if ([51, 53, 55, 56, 57].includes(codigo)) return { tipo: 'rain', descripcion: 'Llovizna' }
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(codigo)) return { tipo: 'rain', descripcion: 'Lluvia' }
    if ([71, 73, 75, 77, 85, 86].includes(codigo)) return { tipo: 'snow', descripcion: 'Nieve' }
    if ([95, 96, 99].includes(codigo)) return { tipo: 'storm', descripcion: codigo === 95 ? 'Tormenta' : 'Tormenta con granizo' }
    return { tipo: 'unknown', descripcion: 'Estado del cielo no disponible' }
}

function actualizarCielo(actual, estado, ventoso) {
    const body = document.body
    body.classList.add('weather-active')
    body.dataset.weather = estado.tipo
    body.dataset.period = actual.is_day === 1 ? 'day' : 'night'
    body.dataset.windy = String(ventoso)
    const nubosidad = Number.isFinite(actual.cloud_cover) ? actual.cloud_cover / 100 : (estado.tipo === 'clear' ? 0 : 0.7)
    body.style.setProperty('--cloud-opacity', Math.max(0, Math.min(1, nubosidad)))
    body.style.setProperty('--cloud-duration', ventoso ? '12s' : '38s')
    const contenedor = document.getElementById('precipitacion')
    contenedor.replaceChildren()
    if (!['rain', 'snow', 'storm'].includes(estado.tipo)) return
    const cantidad = estado.tipo === 'snow' ? 36 : 58
    const fragmento = document.createDocumentFragment()
    for (let i = 0; i < cantidad; i++) {
        const particula = document.createElement('i')
        particula.style.setProperty('--x', ((i * 37) % 101) + '%')
        particula.style.setProperty('--delay', -(i * 0.73) + 's')
        particula.style.setProperty('--duration', (estado.tipo === 'snow' ? 7 + i % 6 : 0.85 + (i % 7) / 10) + 's')
        fragmento.appendChild(particula)
    }
    contenedor.appendChild(fragmento)
}

function escaparHTML(texto) {
    const nodo = document.createElement('span')
    nodo.textContent = texto
    return nodo.innerHTML
}

// Solo se guardan los lugares: al abrirlos se consulta su tiempo actualizado.
function idLugar(lugar) {
    return lugar.lat.toFixed(4) + ',' + lugar.lon.toFixed(4)
}

function leerFavoritas() {
    try {
        const guardadas = JSON.parse(localStorage.getItem(claveFavoritas) || '[]')
        if (!Array.isArray(guardadas)) return []
        const ids = new Set()
        return guardadas.filter(lugar => {
            if (!lugar || typeof lugar.nombre !== 'string' || !lugar.nombre.trim() ||
                typeof lugar.region !== 'string' || !Number.isFinite(lugar.lat) ||
                !Number.isFinite(lugar.lon) || Math.abs(lugar.lat) > 90 || Math.abs(lugar.lon) > 180) return false
            const id = idLugar(lugar)
            if (ids.has(id)) return false
            ids.add(id)
            return true
        })
    } catch {
        return []
    }
}

function persistirFavoritas(nuevas) {
    try {
        localStorage.setItem(claveFavoritas, JSON.stringify(nuevas))
        favoritas = nuevas
        renderizarFavoritas()
        actualizarBotonFavorita()
        return true
    } catch {
        mensajeFavoritas.textContent = 'No se han podido guardar los cambios. Comprueba que el navegador permita el almacenamiento local.'
        return false
    }
}

function actualizarBotonFavorita() {
    const guardada = lugarActual && favoritas.some(lugar => idLugar(lugar) === idLugar(lugarActual))
    guardarFavorita.disabled = !lugarActual || guardada
    guardarFavorita.textContent = guardada ? '★ Ciudad guardada' : '☆ Guardar ciudad actual'
}

guardarFavorita.addEventListener('click', () => {
    if (!lugarActual || favoritas.some(lugar => idLugar(lugar) === idLugar(lugarActual))) return
    if (persistirFavoritas([...favoritas, lugarActual])) {
        mensajeFavoritas.textContent = lugarActual.nombre + ' se ha añadido a tus favoritas.'
    }
})

function renderizarFavoritas() {
    listaFavoritas.replaceChildren()
    mensajeFavoritas.textContent = favoritas.length
        ? 'Guardadas en este navegador. Selecciona una ciudad para consultar su tiempo.'
        : 'Busca una ciudad para guardarla y tenerla siempre a mano.'
    for (const lugar of favoritas) {
        const item = document.createElement('li')
        item.className = 'favorite-card'
        const abrir = document.createElement('button')
        abrir.type = 'button'
        abrir.className = 'favorite-open'
        abrir.setAttribute('aria-label', 'Consultar el tiempo de ' + lugar.nombre + ', ' + lugar.region)
        const icono = document.createElement('span')
        icono.className = 'favorite-star'
        icono.textContent = '☆'
        icono.setAttribute('aria-hidden', 'true')
        const texto = document.createElement('span')
        const nombre = document.createElement('strong')
        nombre.textContent = lugar.nombre
        const region = document.createElement('span')
        region.className = 'favorite-region'
        region.textContent = lugar.region
        texto.append(nombre, region)
        abrir.append(icono, texto)
        abrir.addEventListener('click', () => consultarFavorita(lugar))
        const eliminar = document.createElement('button')
        eliminar.type = 'button'
        eliminar.className = 'favorite-remove'
        eliminar.textContent = '×'
        eliminar.setAttribute('aria-label', 'Quitar ' + lugar.nombre + ' de favoritas')
        eliminar.addEventListener('click', () => {
            const indice = favoritas.findIndex(favorita => idLugar(favorita) === idLugar(lugar))
            if (persistirFavoritas(favoritas.filter(favorita => idLugar(favorita) !== idLugar(lugar)))) {
                mensajeFavoritas.textContent = lugar.nombre + ' se ha eliminado de favoritas.'
                const botones = listaFavoritas.querySelectorAll('.favorite-remove')
                const siguiente = botones[Math.min(indice, botones.length - 1)]
                if (siguiente) siguiente.focus()
                else if (!guardarFavorita.disabled) guardarFavorita.focus()
                else ciudad.focus()
            }
        })
        item.append(abrir, eliminar)
        listaFavoritas.appendChild(item)
    }
}

async function consultarFavorita(lugar) {
    const consulta = iniciarConsulta()
    mensaje.textContent = 'Consultando el tiempo de ' + lugar.nombre + '...'
    mensajeFavoritas.textContent = mensaje.textContent
    try {
        const respuesta = await fetch(crearUrlTiempo(lugar.lat, lugar.lon))
        if (!respuesta.ok) throw new Error('No se ha podido consultar el tiempo.')
        const datos = await respuesta.json()
        if (consulta !== consultaActual) return
        mostrarTiempo(datos, [lugar.nombre, lugar.region].filter(Boolean).join(', '), lugar)
        mensajeFavoritas.textContent = 'Tiempo actualizado de ' + lugar.nombre + '.'
        document.getElementById('tituloPrincipal').scrollIntoView({
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
            block: 'start'
        })
    } catch (error) {
        if (consulta !== consultaActual) return
        mostrarError(error.message)
        mensajeFavoritas.textContent = error.message + ' Puedes intentarlo de nuevo.'
    } finally {
        terminarConsulta(consulta)
    }
}
