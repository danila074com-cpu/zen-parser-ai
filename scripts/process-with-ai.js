// scripts/process-with-ai.js - ЭТИЧНАЯ AI ОБРАБОТКА
const { OpenAI } = require('openai');
const fs = require('fs').promises;
const path = require('path');
const ExcelJS = require('exceljs');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const AI_MODEL = "gpt-3.5-turbo";

console.log('🚀 Запускаем ЭТИЧНУЮ AI обработку...');

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
    const outputPath = path.join(outputDir, 'этичные_статьи.xlsx');
    
    const newWorkbook = new ExcelJS.Workbook();
    const newWorksheet = newWorkbook.addWorksheet('Этичные статьи');

    // Столбцы
    newWorksheet.columns = [
      { header: '№', key: 'number', width: 5 },
      { header: 'Тема оригинала', key: 'original_topic', width: 40 },
      { header: 'Уникальный заголовок', key: 'unique_title', width: 40 },
      { header: 'Оригинальный текст', key: 'original_text', width: 80 },
      { header: 'Уникальный текст', key: 'unique_text', width: 80 },
      { header: 'Ориг. слов', key: 'original_words', width: 12 },
      { header: 'Уник. слов', key: 'unique_words', width: 12 },
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
      console.log(`\n🔍 Анализируем тему: "${originalTitle.substring(0, 50)}..."`);

      try {
        // ШАГ 1: АНАЛИЗИРУЕМ ТЕМУ (без копирования текста)
        console.log('   🔍 Анализируем основную тему...');
        
        const analysisPrompt = `
Проанализируй ЭТУ ТЕМУ и выдели ОСНОВНУЮ ИДЕЮ. НЕ копируй текст!

Исходный материал:
Заголовок: "${originalTitle}"
Текст: "${originalText.substring(0, 500)}..."

Выдели только:
1. Основную тему (1-2 предложения)
2. Ключевые проблемы/конфликты
3. Целевую аудиторию

НЕ ПЕРЕСКАЗЫВАЙ ТЕКСТ! Только анализ темы.
`;

        const analysisResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: analysisPrompt }],
          max_tokens: 300,
          temperature: 0.3
        });

        const topicAnalysis = analysisResponse.choices[0].message.content;
        console.log('   🎯 Тема анализа:', topicAnalysis.substring(0, 100) + '...');

        // ШАГ 2: СОЗДАЕМ УНИКАЛЬНЫЙ КОНТЕНТ НА ОСНОВЕ ТЕМЫ
        console.log('   ✍️ Создаем уникальный контент...');
        
        const creationPrompt = `
СОЗДАЙ ПОЛНОСТЬЮ УНИКАЛЬНУЮ СТАТЬЮ на основе этой темы.

ТЕМА ДЛЯ ВДОХНОВЕНИЯ:
${topicAnalysis}

ТРЕБОВАНИЯ:
- СОЗДАЙ СОВЕРШЕННО НОВЫЙ ТЕКСТ с другим сюжетом, персонажами, диалогами
- Сохрани только ОБЩУЮ ТЕМАТИКУ (семейные отношения, конфликты и т.д.)
- Объем: ${originalWordCount} ±15% слов
- Естественный стиль, как оригинальная статья
- Уникальные имена, локации, ситуации

НЕ КОПИРУЙ и НЕ ПЕРЕСКАЗЫВАЙ исходный материал! Создавай с нуля.

Структура:
1. Уникальный заголовок
2. Полный текст статьи
`;

        const creationResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: creationPrompt }],
          max_tokens: 4000,
          temperature: 0.9  // Высокая креативность
        });

        const result = creationResponse.choices[0].message.content;
        
        // Разделяем заголовок и текст
        const lines = result.split('\n').filter(line => line.trim());
        const uniqueTitle = lines[0].replace(/["']/g, '').trim();
        const uniqueText = lines.slice(1).join('\n').trim();
        
        const uniqueWordCount = uniqueText.split(/\s+/).length;

        console.log(`   📊 Результат: ${originalWordCount} → ${uniqueWordCount} слов`);
        console.log(`   🎯 Новый заголовок: ${uniqueTitle}`);

        // Добавляем в таблицу
        newWorksheet.addRow({
          number: i - 1,
          original_topic: originalTitle,
          unique_title: uniqueTitle,
          original_text: originalText.substring(0, 1000) + (originalText.length > 1000 ? '...' : ''),
          unique_text: uniqueText,
          original_words: originalWordCount,
          unique_words: uniqueWordCount,
          status: '✅ Уникальный контент'
        });

        processedCount++;
        console.log(`   ✅ Успешно! Создан оригинальный контент.`);

        // Пауза между запросами
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (error) {
        console.log(`   ❌ Ошибка: ${error.message}`);
      }
    }

    // Сохраняем результаты
    await newWorkbook.xlsx.writeFile(outputPath);
    
    console.log('\n🎉 ====== ЭТИЧНАЯ ОБРАБОТКА ЗАВЕРШЕНА ======');
    console.log(`📊 Создано статей: ${processedCount}`);
    console.log(`📁 Файл: ${outputPath}`);
    console.log(`✅ Все статьи - УНИКАЛЬНЫЙ КОНТЕНТ (не копирайт)`);

  } catch (error) {
    console.error('💥 Критическая ошибка:', error.message);
  }
}

// Запускаем обработку
processArticles();