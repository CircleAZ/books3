export const compressImage = async (file, maxWidth = 1500, maxHeight = 1500, quality = 0.85) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                // Generate Main Image (1500x1500)
                let width = img.width;
                let height = img.height;
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // Generate Thumbnail (70x70)
                const thumbMaxWidth = 70;
                const thumbMaxHeight = 70;
                let tWidth = img.width;
                let tHeight = img.height;
                if (tWidth > thumbMaxWidth || tHeight > thumbMaxHeight) {
                    const ratio = Math.min(thumbMaxWidth / tWidth, thumbMaxHeight / tHeight);
                    tWidth = Math.round(tWidth * ratio);
                    tHeight = Math.round(tHeight * ratio);
                }
                const tCanvas = document.createElement('canvas');
                tCanvas.width = tWidth;
                tCanvas.height = tHeight;
                const tCtx = tCanvas.getContext('2d');
                tCtx.fillStyle = '#FFFFFF';
                tCtx.fillRect(0, 0, tWidth, tHeight);
                tCtx.drawImage(img, 0, 0, tWidth, tHeight);

                // Convert both to Blobs
                canvas.toBlob((mainBlob) => {
                    if (!mainBlob) return reject(new Error('Main canvas to Blob failed'));
                    
                    tCanvas.toBlob((thumbBlob) => {
                        if (!thumbBlob) return reject(new Error('Thumb canvas to Blob failed'));
                        
                        const baseName = file.name.replace(/\.[^/.]+$/, "");
                        
                        const optimizedFile = new File([mainBlob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
                        const thumbnailFile = new File([thumbBlob], `${baseName}_thumb.webp`, { type: 'image/webp', lastModified: Date.now() });
                        
                        resolve({
                            file: optimizedFile,
                            thumbnail: thumbnailFile,
                            previewUrl: URL.createObjectURL(optimizedFile)
                        });
                    }, 'image/webp', 0.85);
                }, 'image/webp', quality);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};
