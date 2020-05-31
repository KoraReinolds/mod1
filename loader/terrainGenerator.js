const  simplex = new SimplexNoise(),
    canvas = document.getElementById('c'),
    ctx = canvas.getContext('2d'),
    imgdata = ctx.getImageData(0, 0, canvas.width, canvas.height),
    data = imgdata.data;
let t = 0;

(function(){
for (let x = 0; x < 256; x++) {
    for (let y = 0; y < 256; y++) {
        const r = simplex.noise3D(x / 16, y / 16, t/16) * 0.5 + 0.5;
        const g = simplex.noise3D(x / 8, y / 8, t/16) * 0.5 + 0.5;
        data[(x + y * 256) * 4 + 0] = r * 255;
        data[(x + y * 256) * 4 + 1] = (r + g) * 200;
        data[(x + y * 256) * 4 + 2] = 0;
        data[(x + y * 256) * 4 + 3] = 255;
    }
}
                   t++;
ctx.putImageData(imgdata, 0, 0);
})()
