/**
 * HMS Industrial Barcode System - Enterprise Database Sanitizer
 * ============================================================
 * Utility to prepare and sanitize a clean, production-ready database
 * for a new client deployment.
 * 
 * Actions performed:
 * 1. Preserves Master Superadmin accounts (Gamal & Auf).
 * 2. Purges all test/demo orders, barcodes, and scan movements.
 * 3. Purges all non-master user accounts.
 * 4. Resets identity seed counters for Orders and Barcodes.
 * 5. Verifies schema integrity and default production stages.
 */

'use strict';

const sql  = require('mssql');
const path = require('path');
const fs   = require('fs');

try {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {}

const dbConfig = {
    user: process.env.DB_USER || 'hms_user',
    password: process.env.DB_PASSWORD || 'HMS@2024!Secure',
    server: process.env.DB_SERVER || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    database: process.env.DB_NAME || 'HMS_Factory_DB',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

async function sanitizeDatabase() {
    console.log('================================================================');
    console.log('🧹 HMS System - Production Database Sanitizer & Deployment Prep');
    console.log('================================================================');
    console.log(`Connecting to: [${dbConfig.server}] -> Database: [${dbConfig.database}]...\n`);

    let pool = null;
    try {
        pool = await new sql.ConnectionPool(dbConfig).connect();
        console.log('✅ Connected to target database successfully.');

        // 1. Purge dependent transaction tables first
        console.log('⏳ Purging transactional data (Barcodes, Stage Scans, Stock Movements)...');
        await pool.request().query(`
            IF OBJECT_ID('StockMovements', 'U') IS NOT NULL DELETE FROM StockMovements;
            IF OBJECT_ID('OrderBarcodes', 'U') IS NOT NULL DELETE FROM OrderBarcodes;
            IF OBJECT_ID('OrderStages', 'U') IS NOT NULL DELETE FROM OrderStages;
            IF OBJECT_ID('ExternalScans', 'U') IS NOT NULL DELETE FROM ExternalScans;
            IF OBJECT_ID('ExternalOrders', 'U') IS NOT NULL DELETE FROM ExternalOrders;
            IF OBJECT_ID('Orders', 'U') IS NOT NULL DELETE FROM Orders;
        `);
        console.log('✅ All production orders and barcode transactions purged.');

        // 2. Reset identity seed counters
        console.log('⏳ Resetting identity seeds to 1...');
        await pool.request().query(`
            IF OBJECT_ID('Orders', 'U') IS NOT NULL DBCC CHECKIDENT('Orders', RESEED, 0);
            IF OBJECT_ID('OrderBarcodes', 'U') IS NOT NULL DBCC CHECKIDENT('OrderBarcodes', RESEED, 0);
            IF OBJECT_ID('OrderStages', 'U') IS NOT NULL DBCC CHECKIDENT('OrderStages', RESEED, 0);
            IF OBJECT_ID('StockMovements', 'U') IS NOT NULL DBCC CHECKIDENT('StockMovements', RESEED, 0);
        `);
        console.log('✅ Identity seed counters reset.');

        // 3. Clean users table: Preserve only Gamal and Auf
        console.log('⏳ Sanitizing Users: Retaining Master Superadmins [Gamal, Auf] only...');
        await pool.request().query(`
            DELETE FROM Users 
            WHERE LOWER(username) NOT IN ('gamal', 'auf');
        `);

        // Ensure Gamal and Auf exist with full superadmin privileges
        const aufPassHash = '5ca14100fdec1f476e1d5c5d43a5d322d04c50c5e42e9b73976783189b845032';
        const gamalPassHash = 'pbkdf2$100000$446bd09d127fcb201468ba9912ae3dc7$bbd50696577f46b52ec98cea1fe3bd2a2c83a5d7bd559fa27cc27c1abc7a7af8da1fbad48d9de2ce21629b8de00a997898cbe828f85d03b80b6bc06733ae080c';

        await pool.request().input('h1', sql.NVarChar, aufPassHash).query(`
            IF NOT EXISTS (SELECT 1 FROM Users WHERE LOWER(username) = 'auf')
                INSERT INTO Users (username, password, full_name, role, can_view_orders, can_create_orders, can_print_reports, can_manage_users)
                VALUES ('Auf', @h1, N'Auf (Master Superadmin)', 'superadmin', 1, 1, 1, 1);
            ELSE
                UPDATE Users SET role = 'superadmin', can_view_orders = 1, can_create_orders = 1, can_print_reports = 1, can_manage_users = 1 WHERE LOWER(username) = 'auf';
        `);

        await pool.request().input('h2', sql.NVarChar, gamalPassHash).query(`
            IF NOT EXISTS (SELECT 1 FROM Users WHERE LOWER(username) = 'gamal')
                INSERT INTO Users (username, password, full_name, role, can_view_orders, can_create_orders, can_print_reports, can_manage_users)
                VALUES ('Gamal', @h2, N'Gamal (Master Superadmin)', 'superadmin', 1, 1, 1, 1);
            ELSE
                UPDATE Users SET role = 'superadmin', can_view_orders = 1, can_create_orders = 1, can_print_reports = 1, can_manage_users = 1 WHERE LOWER(username) = 'gamal';
        `);

        const remainingUsers = await pool.request().query(`SELECT id, username, role FROM Users`);
        console.log(`✅ Users sanitized. Active Master Accounts (${remainingUsers.recordset.length}):`, 
            remainingUsers.recordset.map(u => `${u.username} (${u.role})`).join(', '));

        // 4. Ensure production stages configuration is active and intact
        const stagesCount = await pool.request().query(`SELECT COUNT(*) AS total FROM ProductionStagesConfig WHERE is_active = 1`);
        console.log(`✅ Production Stages Pipeline verified: [${stagesCount.recordset[0].total}] active stages configured.`);

        console.log('\n================================================================');
        console.log('🎉 Database sanitized and primed for client handover with 100% purity!');
        console.log('================================================================\n');
    } catch (err) {
        console.error('❌ Sanitization failed:', err.message);
        process.exit(1);
    } finally {
        if (pool) await pool.close();
    }
}

if (require.main === module) {
    sanitizeDatabase();
}

module.exports = { sanitizeDatabase };
