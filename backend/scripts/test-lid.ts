
import { ConversationModel } from '../src/models/conversation.model';

import logger from '../src/utils/logger';

async function testLidSupport() {
    try {
        const conversationModel = new ConversationModel();
        const userId = 1; // Assuming user 1 exists
        const testLid = '123456789@lid';
        const testPhone = '551199999999';

        logger.info('Starting LID Support Test...');

        // 1. Create conversation with LID and Phone
        logger.info('1. Testing create with LID...');
        const created = await conversationModel.create({
            user_id: userId,
            contact_number: testPhone,
            contact_name: 'Test LID User',
            lid: testLid,
            status: 'new'
        });
        logger.info(`Created conversation: ID=${created.id}, LID=${created.lid}`);

        if (created.lid !== testLid) {
            logger.error('❌ Failed to save LID on create');
        } else {
            logger.info('✅ LID saved successfully on create');
        }

        // 2. Find by LID
        logger.info('2. Testing findByLid...');
        const foundByLid = await conversationModel.findByLid(userId, testLid);
        if (foundByLid && foundByLid.id === created.id) {
            logger.info('✅ findByLid successful');
        } else {
            logger.error('❌ findByLid failed');
        }

        // 3. Find by UserOrLid
        logger.info('3. Testing findByUserOrLid...');
        const foundByUserOrLid = await conversationModel.findByUserOrLid(userId, testPhone, testLid);
        if (foundByUserOrLid && foundByUserOrLid.id === created.id) {
            logger.info('✅ findByUserOrLid successful');
        } else {
            logger.error('❌ findByUserOrLid failed');
        }

        // 4. Cleanup
        logger.info('4. Cleaning up...');
        await conversationModel.delete(created.id);
        logger.info('✅ Cleanup successful');

    } catch (error: any) {
        logger.error(`Test failed: ${error.message}`);
        console.error(error);
    }
}

testLidSupport();
