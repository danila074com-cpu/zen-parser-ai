// scripts/process-with-ai.js - ПОЛНАЯ AI ОБРАБОТКА
const { OpenAI } = require('openai');
const fs = require('fs').promises;
const path = require('path');
const ExcelJS = require('exceljs');

// Инициализируем OpenAI (ключ будем передавать через переменную окружения)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Выбираем версию ChatGPT
const AI_MODEL = "gpt-3.5-turbo";

console.log('🚀 Запускаем ПОЛНУЮ AI обработку статей...');
console.log(`🤖 Используем модель: ${AI_MODEL}`);

async function processArticles() {
  try {
    // 1. Проверяем API ключ
    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ OpenAI API ключ не найден!');
      console.log('💡 Как запустить:');
      console.log('   OPENAI_API_KEY="твой-ключ" node scripts/process-with-ai.js');
      return;
    }

    // 2. Проверяем исходные статьи
    const inputPath = path.join(__dirname, '../results/Статьи Дзен/Нарочно не придумаешь/Нарочно не придумаешь_articles.xlsx');
    
    console.log('📁 Проверяем файл со статьями...');
    
    try {
      await fs.access(inputPath);
      console.log('✅ Файл со статьей найден!');
    } catch (error) {
      console.log('❌ Файл со статьями не найден! Сначала запусти парсер:');
      console.log('   node parser.js');
      return;
    }

    // 3. Читаем Excel файл
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputPath);
    
    const worksheet = workbook.getWorksheet('Articles');
    const totalArticles = worksheet.rowCount - 1;
    console.log(`📊 Найдено статей: ${totalArticles}`);

    // 4. Создаем папку для результатов
    const outputDir = path.join(__dirname, '../processed');
    await fs.mkdir(outputDir, { recursive: true });
    
    const outputPath = path.join(outputDir, 'уникализированные_статьи.xlsx');
    const newWorkbook = new ExcelJS.Workbook();
    const newWorksheet = newWorkbook.addWorksheet('AI Обработанные статьи');

    // 5. Создаем расширенные заголовки
    newWorksheet.columns = [
      { header: '№', key: 'number', width: 5 },
      { header: 'Оригинальный заголовок', key: 'original_title', width: 35 },
      { header: 'Уникальный заголовок', key: 'unique_title', width: 35 },
      { header: 'Ключевые темы', key: 'themes', width: 25 },
      { header: 'Тональность', key: 'tone', width: 15 },
      { header: 'Ориг. объем (слов)', key: 'original_words', width: 18 },
      { header: 'Уник. объем (слов)', key: 'unique_words', width: 18 },
      { header: 'Статус', key: 'status', width: 20 }
    ];

    // 6. ОБРАБАТЫВАЕМ СТАТЬИ ЧЕРЕЗ AI
    let processedCount = 0;
    let failedCount = 0;

    // Обрабатываем только 1 статью для первого теста (экономия денег)
    const maxArticles = 1;

    for (let i = 2; i <= Math.min(worksheet.rowCount, maxArticles + 1); i++) {
      const row = worksheet.getRow(i);
      const originalTitle = row.getCell(1).value;
      const originalText = row.getCell(2).value;
      
      if (!originalTitle || !originalText) continue;

      const originalWordCount = originalText.split(/\s+/).length;
      console.log(`\n🔍 [${i-1}/${maxArticles}] Обрабатываем: "${originalTitle.substring(0, 40)}..."`);
      console.log(`   📊 Оригинальный объем: ${originalWordCount} слов`);

      try {
        // ШАГ 1: Создаем уникальный заголовок через AI
        console.log('   💡 Создаем уникальный заголовок...');
        
        const titlePrompt = `
Придумай новый привлекательный заголовок для этой статьи. 
Заголовок должен быть уникальным, но передавать ту же суть.

Оригинальный заголовок: "${originalTitle}"

Новый заголовок:
        `;

        const titleResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: titlePrompt }],
          max_tokens: 100,
          temperature: 0.7
        });

        const uniqueTitle = titleResponse.choices[0].message.content.replace(/["']/g, '').trim();

        // ШАГ 2: Уникализируем весь текст статьи
        console.log('   ✍️ Уникализируем текст статьи...');
        
        const textPrompt = `
Перепиши этот текст, сохраняя основные идеи и смысл, но изменив формулировки и стиль.
Старайся сохранить примерно тот же объем текста.

Оригинальный текст:
"${originalText.substring(0, 2000)}"

Уникализированный текст:
        `;

        const textResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: textPrompt }],
          max_tokens: 2500,
          temperature: 0.8
        });

        const uniqueText = textResponse.choices[0].message.content;
        const uniqueWordCount = uniqueText.split(/\s+/).length;

        console.log(`   📊 Результат: ${originalWordCount} → ${uniqueWordCount} слов`);

        // ШАГ 3: Анализируем статью
        console.log('   📝 Анализируем статью...');
        
        const analysisPrompt = `
Проанализируй эту статью и выдели основные темы и тональность.

Текст: "${uniqueText.substring(0, 1000)}"

Ответь в формате:
Темы: тема1, тема2, тема3
Тональность: позитивная/негативная/нейтральная
        `;

        const analysisResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: analysisPrompt }],
          max_tokens: 200,
          temperature: 0.3
        });

        const analysis = analysisResponse.choices[0].message.content;
        const themes = extractThemes(analysis);
        const tone = extractTone(analysis);

        // Добавляем результат в таблицу
        newWorksheet.addRow({
          number: i - 1,
          original_title: originalTitle,
          unique_title: uniqueTitle,
          themes: themes.join(', '),
          tone: tone,
          original_words: originalWordCount,
          unique_words: uniqueWordCount,
          status: '✅ Успешно'
        });

        processedCount++;
        console.log(`   ✅ Успешно! Новый заголовок: ${uniqueTitle}`);
        console.log(`   🎯 Темы: ${themes.join(', ')}`);
        console.log(`   🎭 Тональность: ${tone}`);

        // Ждем 2 секунды между запросами
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`   ❌ Ошибка: ${error.message}`);
        failedCount++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 7. Сохраняем результаты
    await newWorkbook.xlsx.writeFile(outputPath);
    
    console.log('\n🎉 ====== РЕЗУЛЬТАТЫ AI ОБРАБОТКИ ======');
    console.log(`📊 Обработано статей: ${processedCount}`);
    console.log(`❌ Ошибок: ${failedCount}`);
    console.log(`📁 Файл: ${outputPath}`);
    console.log(`💰 Примерная стоимость: $0.02 - $0.05`);

  } catch (error) {
    console.error('💥 Критическая ошибка:', error.message);
  }
}

// Вспомогательные функции
function extractThemes(analysis) {
  try {
    const themesMatch = analysis.match(/Темы[:\s]*([^\n]+)/i);
    return themesMatch ? themesMatch[1].split(',').slice(0, 3).map(t => t.trim()) : ['не определено'];
  } catch (e) {
    return ['семья', 'отношения'];
  }
}

function extractTone(analysis) {
  try {
    const toneMatch = analysis.match(/Тональность[:\s]*([^\n]+)/i);
    return toneMatch ? toneMatch[1].trim() : 'нейтральная';
  } catch (e) {
    return 'нейтральная';
  }
}

// Запускаем обработку
processArticles();