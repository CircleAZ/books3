export const compressImage = async (file, maxWidth = 1500, maxHeight = 1500, quality = 0.85) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                // Only scale if the image is larger than the max bounds
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                // Draw white background in case of transparent PNG to JPEG/WebP conversion
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Canvas to Blob failed'));
                            return;
                        }
                        // Create a new File object from the Blob
                        const optimizedFile = new File(
                            [blob], 
                            file.name.replace(/\.[^/.]+$/, "") + ".webp", 
                            { type: 'image/webp', lastModified: Date.now() }
                        );
                        resolve({
                            file: optimizedFile,
                            previewUrl: URL.createObjectURL(optimizedFile)
                        });
                    },
                    'image/webp',
                    quality
                );
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};
