const { ipcRenderer } = require('electron')
const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')

document.getElementById('selectBtn').addEventListener('click', async () => {
  const filePath = await ipcRenderer.invoke('open-file-dialog')
  if (filePath) {
    document.getElementById('status').textContent = `File terpilih: ${path.basename(filePath)}`
    document.getElementById('unlockBtn').dataset.filePath = filePath
  }
})

document.getElementById('unlockBtn').addEventListener('click', unlockDocx)

async function unlockDocx() {
  const filePath = this.dataset.filePath
  const progressBar = document.getElementById('progressBar')
  const progressContainer = document.querySelector('.progress-container')
  const statusDiv = document.getElementById('status')
  const unlockBtn = document.getElementById('unlockBtn')
  
  if (!filePath) {
    statusDiv.textContent = 'Silakan pilih file terlebih dahulu!'
    statusDiv.className = 'error'
    return
  }

  unlockBtn.disabled = true
  statusDiv.textContent = ''
  progressContainer.style.display = 'block'
  progressBar.style.width = '0%'
  
  try {
    const outputPath = path.join(
      path.dirname(filePath),
      path.basename(filePath, '.docx') + '_unlocked.docx'
    )

    updateProgress(10, 'Memulai proses...')
    
    // Step 1: Copy file
    fs.copyFileSync(filePath, outputPath)
    updateProgress(30, 'Membuat salinan file...')
    
    // Step 2: Process ZIP
    updateProgress(40, 'Membuka dokumen...')
    const zip = new AdmZip(outputPath)
    
    // Step 3: Remove protection elements
    updateProgress(50, 'Menghapus proteksi...')
    removeProtectionElements(zip)
    
    // Step 4: Save changes
    updateProgress(80, 'Menyimpan perubahan...')
    zip.writeZip()
    
    // Step 5: Final validation
    updateProgress(90, 'Memvalidasi hasil...')
    validateResult(outputPath)
    
    updateProgress(100, 'Berhasil! File telah dibuka kuncinya')
    statusDiv.textContent = `File disimpan di:\n${outputPath}`
    statusDiv.className = 'success'
    
  } catch (err) {
    progressBar.style.backgroundColor = '#e74c3c'
    statusDiv.textContent = `Error: ${err.message}`
    statusDiv.className = 'error'
    console.error('Unlock Error:', err)
  } finally {
    unlockBtn.disabled = false
  }
}

// Fungsi bantuan untuk update progress
function updateProgress(percent, message) {
    const progressBar = document.getElementById('progressBar');
    const statusDiv = document.getElementById('status');
    
    progressBar.style.width = `${percent}%`;
    statusDiv.textContent = message;
}
function removeProtectionElements(zip) {
    // 1. Remove app.xml (contains protection flags)
    if (zip.getEntry('docProps/app.xml')) {
        zip.deleteEntry('docProps/app.xml')
    }

    // 2. Process settings.xml
    processXmlFile(zip, 'word/settings.xml', [
        'w:documentProtection',
        'w:writeProtection'
    ])

    // 3. Process document.xml
    processXmlFile(zip, 'word/document.xml', [
        'w:documentProtection',
        'w:writeProtection'
    ])

    // 4. Remove any other protection elements
    const protectionEntries = zip.getEntries().filter(entry => 
        entry.entryName.includes('protection') ||
        entry.entryName.includes('writeProtection')
    )
    
    protectionEntries.forEach(entry => {
        zip.deleteEntry(entry)
    })
}

function processXmlFile(zip, filePath, tagsToRemove) {
    const entry = zip.getEntry(filePath)
    if (!entry) return

    try {
        let content = entry.getData().toString('utf8')
        
        tagsToRemove.forEach(tag => {
            const regex = new RegExp(`<${tag}[^>]*>`, 'g')
            content = content.replace(regex, '')
        })
        
        zip.updateFile(filePath, Buffer.from(content, 'utf8'))
    } catch (e) {
        console.error(`Error processing ${filePath}:`, e)
        throw new Error(`Gagal memproses ${filePath}`)
    }
}

function validateResult(filePath) {
    try {
        // Simple validation: check if file exists and has content
        const stats = fs.statSync(filePath)
        if (stats.size < 1024) {
            throw new Error('File hasil terlalu kecil, kemungkinan proses gagal')
        }
        
        // Additional validation could be added here
    } catch (err) {
        console.error('Validation failed:', err)
        throw new Error('Validasi file hasil gagal')
    }
}