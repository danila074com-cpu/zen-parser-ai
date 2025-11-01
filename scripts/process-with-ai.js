// scripts/process-with-ai.js - РАБОЧАЯ AI ОБРАБОТКА
const { OpenAI } = require('openai');
const fs = require('fs').promises;
const path = require('path');
const ExcelJS = require('exceljs');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const AI_MODEL = "gpt-3.5-turbo";

console.log('🚀 Запускаем РАБОЧУЮ AI обработку...');

async function processArticles() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ OpenAI API ключ не найден!');
      return;
    }

    const inputPath = path.join(__dirname, '../results/Статьи Дзен/Нарочно не придумаешь/Нарочно не придумаешь_articles.xlsx');
    
    console.log('📁 Проверяем файл со статьями...');
    await fs.access(inputPath);
    console.log('✅ Файл со статьей найден!');

    // Читаем Excel файл
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputPath);
    const worksheet = workbook.getWorksheet('Articles');
    const totalArticles = worksheet.rowCount - 1;
    console.log(`📊 Найдено статей: ${totalArticles}`);

    // Создаем папку для результатов
    const outputDir = path.join(__dirname, '../processed');
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'рабочие_статьи.xlsx');
    
    const newWorkbook = new ExcelJS.Workbook();
    const newWorksheet = newWorkbook.addWorksheet('Рабочие статьи');

    // Столбцы
    newWorksheet.columns = [
      { header: '№', key: 'number', width: 5 },
      { header: 'Оригинальный заголовок', key: 'original_title', width: 35 },
      { header: 'Уникальный заголовок', key: 'unique_title', width: 35 },
      { header: 'Оригинальный текст', key: 'original_text', width: 80 },
      { header: 'Уникальный текст', key: 'unique_text', width: 80 },
      { header: 'Ориг. слов', key: 'original_words', width: 12 },
      { header: 'Уник. слов', key: 'unique_words', width: 12 },
      { header: 'Разница', key: 'difference', width: 15 },
      { header: 'Статус', key: 'status', width: 20 }
    ];

    // Обрабатываем 1 статью
    let processedCount = 0;
    const maxArticles = 1;

    for (let i = 2; i <= Math.min(worksheet.rowCount, maxArticles + 1); i++) {
      const row = worksheet.getRow(i);
      const originalTitle = row.getCell(1).value;
      const originalText = row.getCell(2).value;
      
      if (!originalTitle || !originalText) continue;

      const originalWordCount = originalText.split(/\s+/).length;
      console.log(`\n🔍 Обрабатываем: "${originalTitle.substring(0, 50)}..."`);
      console.log(`   📊 Оригинальный объем: ${originalWordCount} слов`);

      try {
        // ШАГ 1: СОЗДАЕМ УНИКАЛЬНЫЙ ЗАГОЛОВОК
        console.log('   💡 Создаем уникальный заголовок...');
        
        const titlePrompt = `Придумай новый уникальный заголовок для этой статьи. Оригинальный заголовок: "${originalTitle}"`;
        
        const titleResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: titlePrompt }],
          max_tokens: 100,
          temperature: 0.7
        });

        const uniqueTitle = titleResponse.choices[0].message.content.replace(/["']/g, '').trim();

        // ШАГ 2: ПЕРЕПИСЫВАЕМ ПОЛНЫЙ ТЕКСТ
        console.log('   ✍️ Переписываем полный текст статьи...');
        
        const textPrompt = `
Перепиши полностью этот текст, сохраняя основную историю и смысл, но изменив имена, детали и диалоги. 
Сохрани примерно тот же объем текста (${originalWordCount} слов).

Оригинальный текст для переработки:
"${originalText}"

Верни только переписанный текст, без дополнительных комментариев.
`;

        const textResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: textPrompt }],
          max_tokens: 4000,
          temperature: 0.8
        });

        const uniqueText = textResponse.choices[0].message.content;
        const uniqueWordCount = uniqueText.split(/\s+/).length;
        
        const diffPercent = Math.round((uniqueWordCount - originalWordCount) / originalWordCount * 100);
        const volumeStatus = Math.abs(diffPercent) <= 15 ? '✅ Сохранен' : `⚠️ ${diffPercent}%`;

        console.log(`   📊 Результат: ${originalWordCount} → ${uniqueWordCount} слов (${volumeStatus})`);
        console.log(`   🎯 Новый заголовок: ${uniqueTitle}`);

        // Добавляем в таблицу
        newWorksheet.addRow({
          number: i - 1,
          original_title: originalTitle,
          unique_title: uniqueTitle,
          original_text: originalText, // ПОЛНЫЙ оригинальный текст
          unique_text: uniqueText, // ПОЛНЫЙ текст без ограничений
          original_words: originalWordCount,
          unique_words: uniqueWordCount,
          difference: volumeStatus,
          status: '✅ Успешно'
        });

        processedCount++;
        console.log(`   ✅ Успешно! Создана уникальная статья.`);

        // Пауза между запросами
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`   ❌ Ошибка: ${error.message}`);
      }
    }

    // Сохраняем результаты
    await newWorkbook.xlsx.writeFile(outputPath);
    
    console.log('\n🎉 ====== РЕЗУЛЬТАТЫ ОБРАБОТКИ ======');
    console.log(`📊 Обработано статей: ${processedCount}`);
    console.log(`📁 Файл: ${outputPath}`);

  } catch (error) {
    console.error('💥 Критическая ошибка:', error.message);
  }
}

// Запускаем обработку
processArticles();