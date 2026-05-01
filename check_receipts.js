const { Expo } = require('expo-server-sdk');
const expo = new Expo();

async function check() {
    const receiptIds = ['019db42d-9cbd-7726-9cfd-28d973617fb2'];
    try {
        const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
        for (const chunk of receiptIdChunks) {
            const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
            console.log('Receipts:', receipts);
        }
    } catch (error) {
        console.error(error);
    }
}

check();
