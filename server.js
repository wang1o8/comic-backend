require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors({
  origin: '*', // Cho phép tất cả các domain trong development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to database:', err.message);
  } else {
    console.log('✅ Connected to database');
    release();
  }
});

// Default categories data
const defaultCategories = [
  { category_id: 'hoc-duong', name: 'HỌC ĐƯỜNG', code: '1111', icon: 'fas fa-school', color: '#6366f1' },
  { category_id: 'mat-the', name: 'MẠT THẾ', code: '2222', icon: 'fas fa-skull-crossbones', color: '#ef4444' },
  { category_id: 'he-thong', name: 'HỆ THỐNG', code: '3333', icon: 'fas fa-cogs', color: '#10b981' },
  { category_id: 'xay-dung', name: 'XÂY DỰNG', code: '4444', icon: 'fas fa-building', color: '#f59e0b' },
  { category_id: 'di-gioi', name: 'DỊ GIỚI', code: '5555', icon: 'fas fa-globe-asia', color: '#8b5cf6' },
  { category_id: 'kinh-doanh', name: 'KINH DOANH', code: '6666', icon: 'fas fa-chart-line', color: '#06b6d4' },
  { category_id: 'trung-sinh', name: 'TRÙNG SINH', code: '7777', icon: 'fas fa-redo', color: '#ec4899' },
  { category_id: 'ngon', name: 'NGÔN', code: '8888', icon: 'fas fa-heart', color: '#f43f5e' },
  { category_id: 'tu-tien', name: 'TU TIÊN', code: 'AAA', icon: 'fas fa-mountain', color: '#22c55e' },
  { category_id: 'do-thi', name: 'ĐÔ THỊ', code: 'BBB', icon: 'fas fa-city', color: '#3b82f6' },
  { category_id: 'phan-dien', name: 'PHẢN DIỆN', code: 'CCC', icon: 'fas fa-user-ninja', color: '#0ea5e9' },
  { category_id: 'vo-han-luu', name: 'VÔ HẠN LƯU', code: 'EEE', icon: 'fas fa-infinity', color: '#a855f7' },
  { category_id: 'manh', name: 'MẠNH', code: 'DDD', icon: 'fas fa-fist-raised', color: '#f97316' },
  { category_id: 'quy-than', name: 'QUỶ THẦN', code: 'FFF', icon: 'fas fa-ghost', color: '#6b7280' },
  { category_id: 'ecchi', name: 'ECCHI', code: '9999', icon: 'fas fa-fire', color: '#dc2626' },
  { category_id: 'phim', name: 'PHIM', code: '0000', icon: 'fas fa-film', color: '#8b5cf6' }
];

// Initialize database tables
async function initializeDatabase() {
  console.log('🔄 Initializing database...');
  
  let client;
  try {
    client = await pool.connect();
    console.log('✅ Database connection established');

    // Create categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        category_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(10) NOT NULL,
        icon VARCHAR(50),
        color VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Categories table created/verified');

    // Create comics table WITHOUT foreign key first
    await client.query(`
      CREATE TABLE IF NOT EXISTS comics (
        id SERIAL PRIMARY KEY,
        comic_id VARCHAR(100) UNIQUE NOT NULL,
        title VARCHAR(500) NOT NULL,
        category_id VARCHAR(50) NOT NULL,
        subcategory VARCHAR(100),
        chapter VARCHAR(50),
        rating VARCHAR(20) DEFAULT 'none',
        tags TEXT[] DEFAULT '{}',
        description TEXT,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Comics table created/verified');

    // Insert default categories if empty
    const categoriesCount = await client.query('SELECT COUNT(*) FROM categories');
    const count = parseInt(categoriesCount.rows[0].count);
    
    if (count === 0) {
      console.log('📥 Inserting default categories...');
      for (const category of defaultCategories) {
        await client.query(
          'INSERT INTO categories (category_id, name, code, icon, color) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (category_id) DO NOTHING',
          [category.category_id, category.name, category.code, category.icon, category.color]
        );
      }
      console.log(`✅ Inserted ${defaultCategories.length} default categories`);
    } else {
      console.log(`📊 Categories table already has ${count} records`);
    }

    // Try to add foreign key constraint if not exists
    try {
      await client.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.table_constraints 
            WHERE constraint_name = 'comics_category_id_fkey' 
            AND table_name = 'comics'
          ) THEN
            ALTER TABLE comics 
            ADD CONSTRAINT comics_category_id_fkey 
            FOREIGN KEY (category_id) 
            REFERENCES categories(category_id) 
            ON DELETE CASCADE;
          END IF;
        END $$;
      `);
      console.log('✅ Foreign key constraint checked/added');
    } catch (fkError) {
      console.log('⚠️ Could not add foreign key, continuing without it:', fkError.message);
    }

    console.log('🎉 Database initialization completed successfully');
  } catch (error) {
    console.error('❌ ERROR initializing database:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    if (client) {
      client.release();
    }
  }
}

// ========== DEBUG ENDPOINTS ==========

// Database debug endpoint
app.get('/api/debug/db', async (req, res) => {
  console.log('🔍 Debug endpoint called');
  
  try {
    const client = await pool.connect();
    
    // Check connection
    const timeResult = await client.query('SELECT NOW()');
    
    // Check tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    // Get row counts
    const tables = tablesResult.rows.map(row => row.table_name);
    const counts = {};
    
    for (const table of tables) {
      try {
        const countResult = await client.query(`SELECT COUNT(*) FROM ${table}`);
        counts[table] = parseInt(countResult.rows[0].count);
      } catch (countError) {
        counts[table] = `Error: ${countError.message}`;
      }
    }
    
    client.release();
    
    res.json({
      status: 'OK',
      timestamp: timeResult.rows[0].now,
      database: 'Connected',
      tables: tables,
      rowCounts: counts,
      env: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        PORT: process.env.PORT || 3000,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        databaseUrlLength: process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0
      }
    });
    
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({
      status: 'ERROR',
      message: error.message,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        hasDatabaseUrl: !!process.env.DATABASE_URL
      }
    });
  }
});

// ========== API ENDPOINTS ==========

// Get all categories
app.get('/api/categories', async (req, res) => {
  console.log('📦 GET /api/categories called');
  
  try {
    // Check if table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'categories'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('⚠️ Categories table does not exist, creating it...');
      await initializeDatabase();
    }
    
    const result = await pool.query('SELECT * FROM categories ORDER BY name');
    
    if (result.rows.length === 0) {
      console.log('📭 Categories table is empty, returning default data');
      res.json(defaultCategories);
    } else {
      console.log(`✅ Returning ${result.rows.length} categories`);
      res.json(result.rows);
    }
    
  } catch (error) {
    console.error('❌ Error fetching categories:', error.message);
    
    // Fallback: return default categories
    console.log('🔄 Falling back to default categories');
    res.json(defaultCategories);
  }
});

// Get all comics
app.get('/api/comics', async (req, res) => {
  console.log('📚 GET /api/comics called with query:', req.query);
  
  try {
    // Check if table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'comics'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('⚠️ Comics table does not exist, returning empty array');
      return res.json([]);
    }
    
    const { category, search, page = 1, limit = 100 } = req.query;
    let query = 'SELECT * FROM comics';
    const params = [];
    let paramCount = 0;

    if (category) {
      query += ` WHERE category_id = $${++paramCount}`;
      params.push(category);
    }

    if (search) {
      query += paramCount > 0 ? ' AND' : ' WHERE';
      query += ` (title ILIKE $${++paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY last_updated DESC';
    
    // Add pagination
    const offset = (page - 1) * limit;
    query += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    console.log(`✅ Found ${result.rows.length} comics`);
    
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching comics:', error.message);
    res.json([]);
  }
});

// Get comics grouped by category and subcategory
app.get('/api/comics/grouped', async (req, res) => {
  console.log('🗂️ GET /api/comics/grouped called');
  
  try {
    // Check if tables exist
    const tablesExist = await pool.query(`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'categories') as categories_exists,
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'comics') as comics_exists
    `);
    
    const { categories_exists, comics_exists } = tablesExist.rows[0];
    
    if (!categories_exists || !comics_exists) {
      console.log('⚠️ Required tables missing, returning empty object');
      return res.json({});
    }
    
    const result = await pool.query(`
      SELECT 
        c.category_id,
        cat.name as category_name,
        c.subcategory,
        json_agg(
          json_build_object(
            'id', c.comic_id,
            'title', c.title,
            'chapter', c.chapter,
            'rating', c.rating,
            'tags', c.tags,
            'description', c.description,
            'lastUpdated', c.last_updated
          ) ORDER BY c.title
        ) as items
      FROM comics c
      LEFT JOIN categories cat ON c.category_id = cat.category_id
      GROUP BY c.category_id, cat.name, c.subcategory
      ORDER BY cat.name, c.subcategory
    `);
    
    console.log(`✅ Grouped ${result.rows.length} categories with comics`);
    
    // Transform to frontend format
    const groupedData = {};
    result.rows.forEach(row => {
      if (!groupedData[row.category_id]) {
        groupedData[row.category_id] = [];
      }
      groupedData[row.category_id].push({
        subcategory: row.subcategory || '',
        items: row.items
      });
    });
    
    res.json(groupedData);
  } catch (error) {
    console.error('❌ Error fetching grouped comics:', error.message);
    res.json({});
  }
});

// Get single comic
app.get('/api/comics/:id', async (req, res) => {
  console.log(`📖 GET /api/comics/${req.params.id}`);
  
  try {
    const result = await pool.query('SELECT * FROM comics WHERE comic_id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comic not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching comic:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add new comic
app.post('/api/comics', async (req, res) => {
  console.log('➕ POST /api/comics called');
  console.log('Data:', req.body);
  
  try {
    const {
      title,
      category_id,
      subcategory,
      chapter,
      rating,
      tags,
      description
    } = req.body;

    // Validate required fields
    if (!title || !category_id) {
      return res.status(400).json({ error: 'Title and category_id are required' });
    }

    // Generate unique comic ID
    const comic_id = `comic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const result = await pool.query(
      `INSERT INTO comics (
        comic_id, title, category_id, subcategory, 
        chapter, rating, tags, description, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *`,
      [
        comic_id,
        title,
        category_id,
        subcategory || '',
        chapter || '',
        rating || 'none',
        tags || [],
        description || ''
      ]
    );

    console.log('✅ Comic added successfully:', result.rows[0].comic_id);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error adding comic:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update comic
app.put('/api/comics/:id', async (req, res) => {
  console.log(`✏️ PUT /api/comics/${req.params.id}`);
  
  try {
    const {
      chapter,
      rating,
      title,
      tags,
      description
    } = req.body;

    const result = await pool.query(
      `UPDATE comics 
       SET chapter = COALESCE($1, chapter),
           rating = COALESCE($2, rating),
           title = COALESCE($3, title),
           tags = COALESCE($4, tags),
           description = COALESCE($5, description),
           last_updated = NOW()
       WHERE comic_id = $6
       RETURNING *`,
      [chapter, rating, title, tags, description, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comic not found' });
    }

    console.log('✅ Comic updated successfully');
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating comic:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update only chapter
app.patch('/api/comics/:id/chapter', async (req, res) => {
  console.log(`📝 PATCH /api/comics/${req.params.id}/chapter`);
  
  try {
    const { chapter } = req.body;
    
    if (!chapter) {
      return res.status(400).json({ error: 'Chapter is required' });
    }
    
    const result = await pool.query(
      `UPDATE comics 
       SET chapter = $1, last_updated = NOW()
       WHERE comic_id = $2
       RETURNING *`,
      [chapter, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comic not found' });
    }

    console.log('✅ Chapter updated to:', chapter);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating chapter:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete comic
app.delete('/api/comics/:id', async (req, res) => {
  console.log(`🗑️ DELETE /api/comics/${req.params.id}`);
  
  try {
    const result = await pool.query(
      'DELETE FROM comics WHERE comic_id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comic not found' });
    }

    console.log('✅ Comic deleted successfully');
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting comic:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stats
app.get('/api/stats', async (req, res) => {
  console.log('📊 GET /api/stats');
  
  try {
    // Check if tables exist
    const tablesExist = await pool.query(`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'categories') as categories_exists,
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'comics') as comics_exists
    `);
    
    const { categories_exists, comics_exists } = tablesExist.rows[0];
    
    let totalItems = 0;
    let totalCategories = 0;
    let readingCount = 0;
    
    if (comics_exists) {
      const totalComics = await pool.query('SELECT COUNT(*) FROM comics');
      totalItems = parseInt(totalComics.rows[0].count);
      
      const readingResult = await pool.query(`
        SELECT COUNT(*) FROM comics 
        WHERE chapter IS NOT NULL AND chapter != '' AND chapter != '0'
      `);
      readingCount = parseInt(readingResult.rows[0].count);
    }
    
    if (categories_exists) {
      const totalCategoriesResult = await pool.query('SELECT COUNT(*) FROM categories');
      totalCategories = parseInt(totalCategoriesResult.rows[0].count);
    } else {
      totalCategories = defaultCategories.length;
    }

    res.json({
      totalItems,
      totalCategories,
      readingCount
    });
  } catch (error) {
    console.error('Error fetching stats:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Import data in bulk
app.post('/api/comics/import', async (req, res) => {
  console.log('📥 POST /api/comics/import');
  
  try {
    const { comics } = req.body;
    
    if (!Array.isArray(comics)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    const imported = [];
    for (const comic of comics) {
      const comic_id = `comic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const result = await pool.query(
        `INSERT INTO comics (
          comic_id, title, category_id, subcategory, 
          chapter, rating, tags, description, last_updated
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (title, category_id) 
        DO UPDATE SET 
          chapter = EXCLUDED.chapter,
          rating = EXCLUDED.rating,
          last_updated = NOW()
        RETURNING *`,
        [
          comic_id,
          comic.title,
          comic.category_id,
          comic.subcategory || '',
          comic.chapter,
          comic.rating || 'none',
          comic.tags || [],
          comic.description || ''
        ]
      );
      
      imported.push(result.rows[0]);
    }

    console.log(`✅ Successfully imported ${imported.length} comics`);
    res.json({ 
      message: `Successfully imported ${imported.length} comics`,
      imported 
    });
  } catch (error) {
    console.error('Error importing comics:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        message: 'Comic Library API',
        endpoints: {
            categories: '/api/categories',
            comics: '/api/comics',
            comics_grouped: '/api/comics/grouped',
            stats: '/api/stats',
            health: '/health',
            debug: '/api/debug/db'
        },
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('🚨 Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(port, async () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🌐 Health check: http://localhost:${port}/health`);
  console.log(`📊 API Root: http://localhost:${port}/`);
  
  // Initialize database
  await initializeDatabase();
});

module.exports = app;