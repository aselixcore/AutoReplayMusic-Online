const ALBUMS_DATA_URL = 'data/albums.json';
const ALBUM_DISPLAY_NAMES = {
    'mbdtf': 'My Beautiful Dark Twisted Fantasy',
    'tpab': 'To Pimp A Butterfly',
    'meteora': 'Meteora',
};

let albums = {};
let albumOrder = [];
let albumPalettes = {};
let currentAlbumId = null;
let currentSongIndex = 0;
let filteredSongs = [];
let isPlaying = false;
let audioPlayer = null;

const coverflow = {
    floatIndex: 0,
    velocity: 0,
    pointerDown: false,
    startX: 0,
    lastX: 0,
    lastTime: 0,
    frame: null,
    autoScroll: false,
    settledFrames: 0,
    targetIndex: null,
    cardWidth: 260,
    spacing: 180,
};

function getAlbumDisplayName(albumId, originalName) {
    return ALBUM_DISPLAY_NAMES[albumId] || originalName || 'Álbum desconocido';
}

function normalizeArtist(artist) {
    if (!artist) return '';
    const trimmed = String(artist).trim();
    if (!trimmed) return '';
    const normalized = trimmed.replace(/\s+/g, ' ');
    const lower = normalized.toLowerCase();
    if (lower === 'desconocido' || lower === 'artista desconocido' || lower === 'unknown') return '';
    return normalized;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function formatTime(seconds) {
    if (Number.isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function fileNameToTitle(fileName) {
    const base = fileName.replace(/\.[^/.]+$/, '');
    const withSpaces = base.replaceAll('_', ' ');
    const words = withSpaces.split(/\s+/);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function mpToRgb(pixel) {
    return `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
}

function parseRgb(rgbString) {
    if (rgbString.startsWith('#')) {
        const bigint = parseInt(rgbString.slice(1), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return [r, g, b];
    }
    const vals = rgbString.replace(/[^0-9,]/g, '').split(',').map(Number);
    return [(vals[0] || 0), (vals[1] || 0), (vals[2] || 0)];
}

function toRgbString(rgbArray) {
    return `rgb(${Math.round(rgbArray[0])}, ${Math.round(rgbArray[1])}, ${Math.round(rgbArray[2])})`;
}

function interpolateRgb(c1, c2, t) {
    return [
        c1[0] + (c2[0] - c1[0]) * t,
        c1[1] + (c2[1] - c1[1]) * t,
        c1[2] + (c2[2] - c1[2]) * t,
    ];
}

async function extractColorPalette(imageUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const size = 100;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, size, size);
            const data = ctx.getImageData(0, 0, size, size).data;

            let r = 0, g = 0, b = 0;
            const count = size * size;
            for (let i = 0; i < data.length; i += 4) {
                const alpha = data[i + 3] / 255;
                r += data[i] * alpha;
                g += data[i + 1] * alpha;
                b += data[i + 2] * alpha;
            }
            r = Math.round(r / count);
            g = Math.round(g / count);
            b = Math.round(b / count);

            const base = [r, g, b];
            const dark = [Math.round(r * 0.3), Math.round(g * 0.3), Math.round(b * 0.3)];
            const bright = [Math.min(255, r + 70), Math.min(255, g + 70), Math.min(255, b + 70)];

            resolve([mpToRgb(base), mpToRgb(dark), mpToRgb(bright)]);
        };
        img.onerror = () => resolve(['#111827', '#0b1120', '#1f2937']);
        img.src = imageUrl;
        if (img.complete) img.onload();
    });
}

function getLuminance(rgb) {
    const values = rgb.replace(/[rgb()]/g, '').split(',').map(x => +x.trim());
    const sRGB = values.map(v => v / 255).map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

function applyDynamicBackground(coverUrl) {
    const wall = document.body;
    extractColorPalette(coverUrl).then(([baseRgb, darkRgb, brightRgb]) => {
        const base = parseRgb(baseRgb);
        const dark = parseRgb(darkRgb);
        const bright = parseRgb(brightRgb);

        wall.style.setProperty('--bg-base', toRgbString(base));
        wall.style.setProperty('--bg-dark', toRgbString(dark));
        wall.style.setProperty('--bg-bright', toRgbString(bright));

        const textColor = getLuminance(toRgbString(base)) > 0.27 ? '#0f172a' : '#f8fafc';
        wall.style.color = textColor;
    });
}

function updateCoverflowBackground() {
    if (!albumOrder.length) return;

    const pos = clamp(coverflow.floatIndex, 0, albumOrder.length - 1);
    const lower = Math.floor(pos);
    const upper = Math.ceil(pos);
    const fraction = pos - lower;

    const lowerPalette = albumPalettes[albumOrder[lower]];
    const upperPalette = albumPalettes[albumOrder[upper]] || lowerPalette;

    if (!lowerPalette || !upperPalette) return;

    const base = interpolateRgb(lowerPalette.base, upperPalette.base, fraction);
    const dark = interpolateRgb(lowerPalette.dark, upperPalette.dark, fraction);
    const bright = interpolateRgb(lowerPalette.bright, upperPalette.bright, fraction);

    const wall = document.body;
    wall.style.setProperty('--bg-base', toRgbString(base));
    wall.style.setProperty('--bg-dark', toRgbString(dark));
    wall.style.setProperty('--bg-bright', toRgbString(bright));

    const textColor = getLuminance(toRgbString(base)) > 0.27 ? '#0f172a' : '#f8fafc';
    wall.style.color = textColor;
}


function setActiveAlbumCoverflow(albumId) {
    if (!albumOrder.length) return;
    const idx = albumOrder.indexOf(albumId);
    if (idx < 0) return;
    coverflow.floatIndex = idx;
    renderCoverflow();
}

function moveCoverflowBy(step) {
    if (!albumOrder.length) return;

    const target = clamp(Math.round(coverflow.floatIndex) + step, 0, albumOrder.length - 1);
    coverflow.targetIndex = target;
    coverflow.pointerDown = false;
    coverflow.velocity = 0;
    coverflow.settledFrames = 0;
}

function renderCoverflow() {
    const track = document.getElementById('coverflow-track');
    if (!track) return;

    const center = coverflow.floatIndex;
    const minIndex = Math.max(0, Math.floor(center) - 5);
    const maxIndex = Math.min(albumOrder.length - 1, Math.floor(center) + 5);

    track.innerHTML = '';

    for (let i = minIndex; i <= maxIndex; i++) {
        const albumId = albumOrder[i];
        const album = albums[albumId];
        const coverUrl = album.cover || `music/${album.folder}/cover.jpg`;
        const card = document.createElement('button');
        card.className = 'coverflow-card';
        card.type = 'button';
        card.dataset.index = i;
        card.dataset.albumId = albumId;
        card.setAttribute('aria-label', `${getAlbumDisplayName(albumId, album.name)} - ${album.artist}`);

        card.innerHTML = `
            <img class="coverflow-card-img" loading="lazy" src="${coverUrl}" alt="${getAlbumDisplayName(albumId, album.name)}" />
            <div class="coverflow-card-reflection"></div>
        `;

        const img = card.querySelector('.coverflow-card-img');
        if (img) {
            img.addEventListener('load', () => img.classList.add('loaded'));
            img.addEventListener('error', () => {
                img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 24 24"><path fill="%23ffffff" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
                img.classList.add('loaded');
            });
            if (img.complete && img.naturalWidth !== 0) {
                img.classList.add('loaded');
            }
        }

        card.addEventListener('click', () => {
            selectAlbum(albumId); 
            playFirstSong(albumId);
        });

        card.addEventListener('dblclick', (e) => {
            e.preventDefault();
            selectAlbum(albumId);
            playFirstSong(albumId);
        });

        track.appendChild(card);
    }

    updateCoverflowTransforms();
}

function updateCoverflowTransforms() {
    const cards = document.querySelectorAll('.coverflow-card');
    const offsetX = 0;

    cards.forEach((card) => {
        const i = Number(card.dataset.index);
        const delta = i - coverflow.floatIndex;
        const absDelta = Math.abs(delta);

        const translateX = delta * coverflow.spacing;
        const translateZ = -Math.max(0, absDelta * 90);
        const rotateY = delta * 16;
        const scale = clamp(1 - 0.14 * absDelta, 0.58, 1.01);
        const alpha = clamp(1 - absDelta * 0.22, 0.08, 1);

        card.style.transform = `translate3d(${translateX + offsetX}px, -50%, ${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
        card.style.opacity = alpha;
        card.style.zIndex = String(999 - Math.round(absDelta * 10));

        if (absDelta < 0.45) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });

}

function trySettleCoverflowSelection() {
    if (!albumOrder.length) return;
    const nearest = clamp(Math.round(coverflow.floatIndex), 0, albumOrder.length - 1);
    const nearestAlbumId = albumOrder[nearest];
    const diff = Math.abs(coverflow.floatIndex - nearest);

    if (nearestAlbumId && nearestAlbumId !== currentAlbumId && diff < 0.01) {
        selectAlbum(nearestAlbumId, { withCoverflowUpdate: false });
    }
}

function coverflowLoop() {
    if (!coverflow.pointerDown) {
        if (coverflow.targetIndex !== null) {
            const target = coverflow.targetIndex;
            const diff = target - coverflow.floatIndex;
            coverflow.floatIndex += diff * 0.3;

            if (Math.abs(diff) < 0.005) {
                coverflow.floatIndex = target;
                coverflow.targetIndex = null;
                coverflow.settledFrames = 0;
            }

            coverflow.velocity = 0;
        } else if (Math.abs(coverflow.velocity) > 0.0002) {
            coverflow.floatIndex -= coverflow.velocity;
            coverflow.velocity *= 0.88;
        } else {
            const target = Math.round(coverflow.floatIndex);
            const diff = target - coverflow.floatIndex;
            coverflow.floatIndex += diff * 0.25;
            if (Math.abs(diff) < 0.003) {
                coverflow.floatIndex = target;
                coverflow.velocity = 0;
            }
        }

        if (Math.abs(coverflow.floatIndex - Math.round(coverflow.floatIndex)) < 0.01) {
            coverflow.velocity *= 0.92;
            coverflow.settledFrames += 1;
        } else {
            coverflow.settledFrames = 0;
        }

        const nearest = clamp(Math.round(coverflow.floatIndex), 0, albumOrder.length - 1);
        const nearestAlbumId = albumOrder[nearest];
        if (coverflow.settledFrames > 5 && nearestAlbumId && nearestAlbumId !== currentAlbumId) {
            selectAlbum(nearestAlbumId, { withCoverflowUpdate: false });
        }

        coverflow.floatIndex = clamp(coverflow.floatIndex, 0, albumOrder.length - 1);
        updateCoverflowTransforms();
        updateCoverflowBackground();
    } else {
        coverflow.settledFrames = 0;
    }

    coverflow.frame = requestAnimationFrame(coverflowLoop);
}

function setupCoverflowInteraction() {
    const track = document.getElementById('coverflow-track');
    if (!track) return;

    const pointerStart = (clientX) => {
        coverflow.pointerDown = true;
        coverflow.startX = clientX;
        coverflow.lastX = clientX;
        coverflow.lastTime = Date.now();
        coverflow.velocity = 0;
        track.style.cursor = 'grabbing';
    };

    const pointerMove = (clientX) => {
        if (!coverflow.pointerDown) return;
        const dx = clientX - coverflow.lastX;
        const now = Date.now();
        const dt = Math.max(16, now - coverflow.lastTime);
        coverflow.velocity = dx / dt * 0.17;
        coverflow.floatIndex -= dx * 0.0045;
        coverflow.floatIndex = clamp(coverflow.floatIndex, 0, albumOrder.length - 1);
        coverflow.lastX = clientX;
        coverflow.lastTime = now;
        updateCoverflowTransforms();
    };

    const pointerEnd = () => {
        coverflow.pointerDown = false;
        track.style.cursor = 'grab';
    };

    track.addEventListener('mousedown', (e) => { e.preventDefault(); pointerStart(e.clientX); });
    window.addEventListener('mousemove', (e) => pointerMove(e.clientX));
    window.addEventListener('mouseup', pointerEnd);

    track.addEventListener('touchstart', (e) => { const touch = e.touches[0]; pointerStart(touch.clientX); });
    track.addEventListener('touchmove', (e) => { const touch = e.touches[0]; pointerMove(touch.clientX); });
    track.addEventListener('touchend', pointerEnd);

    track.style.cursor = 'grab';
}

function initializeCoverflow() {
    albumOrder = Object.keys(albums);
    if (albumOrder.length === 0) return;
    if (!currentAlbumId || !albums[currentAlbumId]) currentAlbumId = albumOrder[0];
    coverflow.floatIndex = albumOrder.indexOf(currentAlbumId);
    renderCoverflow();
    setupCoverflowInteraction();
    if (!coverflow.frame) coverflow.frame = requestAnimationFrame(coverflowLoop);
}

function updateAlbumDetails(albumId) {
    if (!albums[albumId]) return;
    const album = albums[albumId];

    const titleEl = document.getElementById('selected-album-title');
    const artistEl = document.getElementById('selected-album-artist');
    const yearEl = document.getElementById('selected-album-year');

    if (titleEl) titleEl.textContent = getAlbumDisplayName(albumId, album.name);

    const displayArtist = normalizeArtist(album.artist);
    if (artistEl) artistEl.textContent = displayArtist || '';

    const year = album.year || 'N/D';
    const genre = album.genre || 'Género desconocido';
    const count = (album.songs || []).length;
    if (yearEl) yearEl.textContent = `${year} · ${genre} · ${count} canción${count === 1 ? '' : 'es'}`;
}

function selectAlbum(albumId, options = { withCoverflowUpdate: true }) {
    if (!albums[albumId]) return;
    currentAlbumId = albumId;
    currentSongIndex = 0;

    document.querySelectorAll('.album-item').forEach(item => item.classList.toggle('active', item.dataset.albumId === albumId));
    document.querySelectorAll('.coverflow-card').forEach(item => item.classList.toggle('active', item.dataset.albumId === albumId));

    const album = albums[albumId];
    const albumComposerEl = document.getElementById('album-composer');
    if (albumComposerEl) {
        const composerText = album.composer || album.songwriter || 'Sin información de compositor';
        albumComposerEl.textContent = `Compositor: ${composerText}`;
    }

    const showName = getAlbumDisplayName(albumId, album.name);
    const songsTitle = document.getElementById('songs-title');
    if (songsTitle) songsTitle.textContent = `${showName} - Canciones`;

    filteredSongs = (album.songs || []).map((song, index) => ({ albumId, albumFolder: album.folder, song, songIndex: index }));
    renderSongs(filteredSongs);

    const coverUrl = album.cover || `music/${album.folder}/cover.jpg`;
    applyDynamicBackground(coverUrl);
    updateAlbumDetails(albumId);
    setActiveAlbumCoverflow(albumId);

    if (!options.withCoverflowUpdate) return;

    if (albumOrder.length) {
        const selectedIndex = albumOrder.indexOf(albumId);
        if (selectedIndex >= 0) {
            coverflow.floatIndex = selectedIndex;
            renderCoverflow();
        }
    }
}

function playFirstSong(albumId) {
    const album = albums[albumId];
    if (!album || !album.songs || !album.songs.length) return;
    playSong(0, album.songs, album.folder, albumId);
}

function renderAlbums() {
    const albumListElement = document.getElementById('album-list');
    if (!albumListElement) return;
    albumListElement.innerHTML = '';

    Object.keys(albums).forEach(albumId => {
        const album = albums[albumId];
        const displayName = getAlbumDisplayName(albumId, album.name);
        const coverUrl = album.cover || `music/${album.folder}/cover.jpg`;
        const li = document.createElement('li');

        li.className = 'album-item';
        li.dataset.albumId = albumId;
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');

        const img = document.createElement('img');
        img.className = 'album-thumb';
        img.loading = 'lazy';
        img.src = coverUrl;
        img.alt = displayName;

        const fallbackSrc = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%23ffffff"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';

        img.addEventListener('error', () => {
            if (img.src !== fallbackSrc) {
                img.src = fallbackSrc;
            }
        });

        const infoDiv = document.createElement('div');
        const nameSpan = document.createElement('span');
        nameSpan.className = 'album-name';
        nameSpan.textContent = displayName;

        infoDiv.appendChild(nameSpan);

        const artistText = normalizeArtist(album.artist);
        if (artistText) {
            const artistSpan = document.createElement('span');
            artistSpan.className = 'album-artist';
            artistSpan.textContent = artistText;
            infoDiv.appendChild(artistSpan);
        }

        li.appendChild(img);
        li.appendChild(infoDiv);

        li.addEventListener('click', () => selectAlbum(albumId));
        li.addEventListener('keypress', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectAlbum(albumId); } });

        albumListElement.appendChild(li);
    });
}

function renderSongs(songs) {
    const songsListElement = document.getElementById('songs-list');
    if (!songsListElement) return;
    songsListElement.innerHTML = '';

    if (!Array.isArray(songs) || songs.length === 0) {
        const noResults = document.createElement('li');
        noResults.className = 'no-results';
        noResults.textContent = 'No se encontraron canciones.';
        songsListElement.appendChild(noResults);
        return;
    }

    songs.forEach((item, index) => {
        const songObject = item.song ? item.song : item;
        const albumId = item.albumId || currentAlbumId;
        const albumFolder = item.albumFolder || (albums[albumId] ? albums[albumId].folder : '');
        const songIndex = item.songIndex ?? index;

        const li = document.createElement('li');
        li.className = `song-item ${(albumId === currentAlbumId && songIndex === currentSongIndex) ? 'active' : ''}`;
        li.dataset.songIndex = songIndex;
        li.dataset.albumId = albumId;

        li.innerHTML = `
            <div class="song-info">
                <span class="song-number">${String(songIndex + 1).padStart(2, '0')}</span>
                <span class="song-title">${songObject.title || fileNameToTitle(songObject.file)}</span>
            </div>
            <button class="play-song-btn" data-index="${songIndex}" data-album-id="${albumId}" title="Reproducir">▶</button>
        `;

        li.addEventListener('click', (e) => {
            if (e.target.classList.contains('play-song-btn')) return;
            playSong(songIndex, songs, albumFolder, albumId);
        });

        const playBtn = li.querySelector('.play-song-btn');
        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playSong(songIndex, songs, albumFolder, albumId);
        });

        songsListElement.appendChild(li);
    });
}

function playSong(index, songs, albumFolder, albumId) {
    if (!songs?.[index]) return;
    const listItem = songs[index];
    const song = listItem.song ? listItem.song : listItem;
    const resolvedAlbumId = albumId || listItem.albumId || currentAlbumId;
    const resolvedAlbum = albums[resolvedAlbumId];
    const resolvedFolder = albumFolder || listItem.albumFolder || (resolvedAlbum ? resolvedAlbum.folder : '');
    const songPath = `music/${resolvedFolder}/${song.file}`;

    currentAlbumId = resolvedAlbumId;
    currentSongIndex = listItem.songIndex ?? index;

    document.querySelectorAll('.song-item').forEach(item => {
        item.classList.toggle('active', Number.parseInt(item.dataset.songIndex, 10) === currentSongIndex && item.dataset.albumId === currentAlbumId);
    });

    audioPlayer.src = songPath;
    audioPlayer.load();
    audioPlayer.play().then(() => {
        isPlaying = true;
        updatePlayButton();
        updatePlayerInfo(song);
    }).catch(error => {
        console.error('Error reproduciendo:', error);
    });

    if (albums[currentAlbumId]) {
        applyDynamicBackground(albums[currentAlbumId].cover || `music/${albums[currentAlbumId].folder}/cover.jpg`);
        updateAlbumDetails(currentAlbumId);
    }
}

function updatePlayerInfo(song) {
    const playerSongName = document.getElementById('player-song-name');
    const playerAlbumName = document.getElementById('player-album-name');
    const playerCover = document.getElementById('player-cover');

    if (playerSongName) playerSongName.textContent = song.title || fileNameToTitle(song.file);
    if (playerAlbumName) playerAlbumName.textContent = getAlbumDisplayName(currentAlbumId, albums[currentAlbumId]?.name);

    if (playerCover && currentAlbumId) {
        const album = albums[currentAlbumId];
        const coverUrl = album.cover || `music/${album.folder}/cover.jpg`;
        playerCover.src = coverUrl;
        playerCover.onerror = function() { this.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%23ffffff"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>'; };
    }
}

function togglePlayPause() {
    if (!audioPlayer.src) {
        if (currentAlbumId && albums[currentAlbumId]) {
            playSong(0, albums[currentAlbumId].songs, albums[currentAlbumId].folder, currentAlbumId);
        }
        return;
    }
    if (isPlaying) {
        audioPlayer.pause();
    } else {
        audioPlayer.play();
    }
    isPlaying = !isPlaying;
    updatePlayButton();
}

function updatePlayButton() {
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) {
        playPauseBtn.textContent = isPlaying ? '⏸' : '▶';
        playPauseBtn.title = isPlaying ? 'Pausar' : 'Reproducir';
    }
}

function updateProgress() {
    const progressBar = document.getElementById('progress-bar');
    const currentTimeSpan = document.getElementById('current-time');
    if (progressBar && audioPlayer.duration) {
        const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressBar.value = progress;
    }
    if (currentTimeSpan) currentTimeSpan.textContent = formatTime(audioPlayer.currentTime);
}

function updateDuration() {
    const durationSpan = document.getElementById('duration');
    const progressBar = document.getElementById('progress-bar');
    if (durationSpan && audioPlayer.duration) durationSpan.textContent = formatTime(audioPlayer.duration);
    if (progressBar) progressBar.max = 100;
}

function seek(e) {
    if (audioPlayer.duration) {
        const seekTime = (e.target.value / 100) * audioPlayer.duration;
        audioPlayer.currentTime = seekTime;
    }
}

function playNext() {
    if (!currentAlbumId) return;
    const album = albums[currentAlbumId];
    const nextIndex = currentSongIndex + 1;
    if (nextIndex < (album.songs || []).length) {
        playSong(nextIndex, album.songs, album.folder, currentAlbumId);
    } else {
        isPlaying = false;
        updatePlayButton();
    }
}

function playPrevious() {
    if (!currentAlbumId) return;
    const prevIndex = currentSongIndex - 1;
    if (prevIndex >= 0) {
        playSong(prevIndex, albums[currentAlbumId].songs, albums[currentAlbumId].folder, currentAlbumId);
    }
}

function mostrarError(mensaje) {
    console.error(mensaje);
    const albumList = document.getElementById('album-list');
    if (albumList) {
        albumList.innerHTML = `<li class="error-message">${mensaje}</li>`;
    }
}

function setupEventListeners() {
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);

    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    if (prevBtn) prevBtn.addEventListener('click', playPrevious);
    if (nextBtn) nextBtn.addEventListener('click', playNext);

    const playAlbumBtn = document.getElementById('btn-play-album');
    if (playAlbumBtn) playAlbumBtn.addEventListener('click', () => playFirstSong(currentAlbumId));

    const prevCoverBtn = document.getElementById('coverflow-prev');
    const nextCoverBtn = document.getElementById('coverflow-next');
    if (prevCoverBtn) prevCoverBtn.addEventListener('click', () => moveCoverflowBy(-1));
    if (nextCoverBtn) nextCoverBtn.addEventListener('click', () => moveCoverflowBy(1));

    const songSearchInput = document.getElementById('song-search');
    if (songSearchInput) {
        songSearchInput.addEventListener('input', (e) => applySongFilter(e.target.value));
        songSearchInput.addEventListener('focus', () => {
            document.body.classList.add('search-focus'); renderSearchResults(filteredSongs);
        });
    }

    document.addEventListener('click', (e) => {
        const panel = document.getElementById('search-results-panel');
        const searchContainer = document.querySelector('.top-search-container');
        if (!panel || !searchContainer) return;
        if (!searchContainer.contains(e.target)) {
            panel.classList.add('hidden');
            document.body.classList.remove('search-focus');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.key === 'Escape') {
            const panel = document.getElementById('search-results-panel');
            if (panel) panel.classList.add('hidden');
            document.body.classList.remove('search-focus');
            if (songSearchInput) songSearchInput.value = '';
            applySongFilter('');
        }

        switch (e.code) {
            case 'Space': e.preventDefault(); togglePlayPause(); break;
            case 'ArrowRight': if (e.ctrlKey) playNext(); break;
            case 'ArrowLeft': if (e.ctrlKey) playPrevious(); break;
        }
    });

    const progressBar = document.getElementById('progress-bar');
    if (progressBar) progressBar.addEventListener('input', seek);

    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('loadedmetadata', updateDuration);
    audioPlayer.addEventListener('ended', playNext);
}

function applySongFilter(query) {
    const searchText = String(query || '').trim().toLowerCase();
    if (!searchText) {
        if (currentAlbumId && albums[currentAlbumId]) {
            const album = albums[currentAlbumId];
            filteredSongs = (album.songs || []).map((song, index) => ({ albumId: currentAlbumId, albumFolder: album.folder, song, songIndex: index }));
            const songsTitle = document.getElementById('songs-title');
            if (songsTitle) songsTitle.textContent = `${getAlbumDisplayName(currentAlbumId, album.name)} - Canciones`;
        } else {
            filteredSongs = [];
            const songsTitle = document.getElementById('songs-title');
            if (songsTitle) songsTitle.textContent = 'Canciones';
        }
    } else {
        filteredSongs = [];
        Object.entries(albums).forEach(([albumId, album]) => {
            (album.songs || []).forEach((song, index) => {
                const title = String(song.title || fileNameToTitle(song.file)).toLowerCase();
                const albumName = getAlbumDisplayName(albumId, album.name).toLowerCase();
                if (title.includes(searchText) || albumName.includes(searchText)) {
                    filteredSongs.push({ albumId, albumFolder: album.folder, song, songIndex: index });
                }
            });
        });
        const songsTitle = document.getElementById('songs-title');
        if (songsTitle) songsTitle.textContent = 'Resultados de búsqueda';
    }

    currentSongIndex = 0;
    renderSongs(filteredSongs);
    renderSearchResults(filteredSongs);
}

function renderSearchResults(results) {
    const panel = document.getElementById('search-results-panel');
    const list = document.getElementById('search-results-list');
    if (!panel || !list) return;

    list.innerHTML = '';
    const query = document.getElementById('song-search')?.value.trim();
    if (!query || results.length === 0) {
        panel.classList.add('hidden');
        return;
    }

    panel.classList.remove('hidden');
    results.slice(0, 20).forEach(item => {
        const song = item.song; const album = albums[item.albumId];
        const li = document.createElement('li');
        li.className = 'search-result-item';
        li.tabIndex = 0;
        li.innerHTML = `<span class="title">${song.title || fileNameToTitle(song.file)}</span><span class="meta">${getAlbumDisplayName(item.albumId, album?.name || '')}</span>`;
        li.addEventListener('click', () => {
            if (item.albumId && albums[item.albumId]) {
                selectAlbum(item.albumId);
                playSong(item.songIndex, albums[item.albumId].songs, albums[item.albumId].folder, item.albumId);
            }
            panel.classList.add('hidden');
            document.body.classList.remove('search-focus');
            const searchInput = document.getElementById('song-search');
            if (searchInput) { searchInput.value = ''; searchInput.blur(); }
        });
        li.addEventListener('keypress', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } });
        list.appendChild(li);
    });
}

async function preloadAlbumPalettes() {
    const albumIds = Object.keys(albums);
    await Promise.all(albumIds.map(async (albumId) => {
        const album = albums[albumId];
        const coverUrl = album.cover || `music/${album.folder}/cover.jpg`;

        try {
            const [baseRgb, darkRgb, brightRgb] = await extractColorPalette(coverUrl);
            albumPalettes[albumId] = {
                base: parseRgb(baseRgb),
                dark: parseRgb(darkRgb),
                bright: parseRgb(brightRgb),
            };
        } catch (err) {
            albumPalettes[albumId] = {
                base: parseRgb('rgb(17,24,39)'),
                dark: parseRgb('rgb(11,17,32)'),
                bright: parseRgb('rgb(31,41,55)'),
            };
        }
    }));
}

async function loadAlbums() {
    try {
        const response = await fetch(ALBUMS_DATA_URL);
        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        albums = await response.json();
        renderAlbums();

        await preloadAlbumPalettes();

        const albumIds = Object.keys(albums);
        if (albumIds.length > 0) {
            currentAlbumId = albumIds[0];
            selectAlbum(currentAlbumId);
        }
        initializeCoverflow();
    } catch (error) {
        console.error('Error cargando álbumes:', error);
        mostrarError('No se pudieron cargar los álbumes. Asegúrate de que albums.json existe.');
    }
}

function getStoredUserName() {
    return localStorage.getItem('armOnlineUser') || '';
}

function updateUserGreeting() {
    const greetingEl = document.getElementById('user-greeting');
    const logoutBtn = document.getElementById('logout-btn');
    const userName = getStoredUserName();

    if (greetingEl) {
        greetingEl.textContent = userName ? `Hola, ${userName}` : '';
    }
    if (logoutBtn) {
        logoutBtn.classList.toggle('hidden', !userName);
    }
}

function showLoginScreen(show) {
    const loginScreen = document.getElementById('login-screen');
    const appWrapper = document.querySelector('.app-wrapper');
    const player = document.querySelector('.player');

    if (loginScreen) {
        loginScreen.classList.toggle('hidden', !show);
    }

    if (appWrapper) {
        appWrapper.style.display = show ? 'none' : 'flex';
    }

    if (player) {
        player.style.display = show ? 'none' : 'flex';
    }

    updateUserGreeting();
}

function logoutUser() {
    localStorage.removeItem('armOnlineLoggedIn');
    localStorage.removeItem('armOnlineUser');
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.reset();
    }
    showLoginScreen(true);
    updateUserGreeting();
}

function handleLoginSubmission(event) {
    event.preventDefault();
    const userInput = document.getElementById('login-user');
    const passInput = document.getElementById('login-pass');

    if (userInput && passInput && userInput.value.trim() && passInput.value.trim()) {
        localStorage.setItem('armOnlineLoggedIn', 'true');
        localStorage.setItem('armOnlineUser', userInput.value.trim());
        showLoginScreen(false);
    } else {
        alert('Ingrese usuario y contraseña para continuar.');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    audioPlayer = new MockAudioPlayer();
    setupEventListeners();

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginSubmission);
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logoutUser);
    }

    const loggedIn = localStorage.getItem('armOnlineLoggedIn') === 'true';
    const savedUser = getStoredUserName();
    if (loggedIn && savedUser) {
        showLoginScreen(false);
    } else {
        showLoginScreen(true);
    }

    await loadAlbums();
});
