(() => {
  const axes = ['x', 'y', 'z']
  const loader = document.getElementById('loader')
  if (!loader) {
    console.log('loader not found, set some block id="loader"')
    return
  }
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    loader.addEventListener(eventName, preventDefaults, false)
  })
  function preventDefaults (e) {
    e.preventDefault()
    e.stopPropagation()
  }
  ['dragenter', 'dragover'].forEach(eventName => {
    loader.addEventListener(eventName, highlight, false)
  })
  ;['dragleave', 'drop'].forEach(eventName => {
    loader.addEventListener(eventName, unhighlight, false)
  })
  function highlight(e) {
    loader.classList.add('mark')
  }
  function unhighlight(e) {
    loader.classList.remove('mark')
  }
  loader.addEventListener('drop', handleDrop, false)
  function handleDrop(e) {
    const dt = e.dataTransfer
    const files = dt.files
    handleFiles(files)
    console.log(dt, files)
  }
  function handleFiles(files) {
    ([...files]).forEach(file => {
      if (validateFile(file)) {
        previewFile(file)
      }
      else {
        console.log('Invalid file')
      }
    })
  }
  function validateFile(file) {
    if (file) {
      const fileName = file.name
      if (fileName && fileName.length > 4) {
        if (fileName.substring(fileName.length - 5) === '.mod1') {
          return true
        }
      }
    }
    return false
  }
  function parseData (string) {
    const data = []
    string
    .split(/[\n*\s*]/)
    .forEach(item => {
      if (item.length > 1 && item[0] === '(' && item[item.length - 1] === (')')) {
        const coords = {}
        item
        .substring(1, item.length - 1)
        .split(',', 3)
        .map((e, index) => {
          coords[axes[index]] = parseInt(e)
        })
        data.push(coords)
      }
    })
    return data
  }
  function previewFile(file) {
    const reader = new FileReader()
    reader.onloadend = function() {
      const name = file.name.slice(0, -5)
      localStorage.setItem(name, JSON.stringify(parseData(reader.result)))
      console.log(JSON.parse(localStorage.getItem(name)))
    }
    reader.readAsText(file)
  }
})()
