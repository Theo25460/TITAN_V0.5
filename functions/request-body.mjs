// Read at most the application limit even when Content-Length is absent or incorrect.
export async function readBoundedBytes(request, limit) {
    const reader = request.body?.getReader();
    if (!reader) return Buffer.alloc(0);
    const chunks = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) return Buffer.concat(chunks, length);
            length += value.byteLength;
            if (length > limit) {
                void reader.cancel().catch(() => {});
                return null;
            }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
}
