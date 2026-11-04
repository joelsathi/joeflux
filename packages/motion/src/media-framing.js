// Shared by the editor crop preview and exported media planes.
export function drawCameraMedia(ctx, image, width, height, zoom, fit) {
  const left=(width-width*zoom.scale)/2+zoom.x*width;
  const top=(height-height*zoom.scale)/2+zoom.y*height;
  if(fit==='cover') {
    const iw=image.naturalWidth??image.width,ih=image.naturalHeight??image.height;
    const ratio=Math.max(width/iw,height/ih),sw=width/ratio,sh=height/ratio;
    ctx.drawImage(image,(iw-sw)/2,(ih-sh)/2,sw,sh,left,top,width*zoom.scale,height*zoom.scale);
  } else ctx.drawImage(image,left,top,width*zoom.scale,height*zoom.scale);
}
