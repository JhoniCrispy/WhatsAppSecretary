const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class SetupWizard {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
  }

  async run() {
    console.log(chalk.blue.bold('🚀 WhatsApp Secretary Setup Wizard\n'));
    
    await this.checkEnvironment();
    await this.setupEnvironmentFile();
    await this.checkOllama();
    await this.checkGoogleCredentials();
    await this.createDirectories();
    
    console.log(chalk.green.bold('\n✅ Setup complete!'));
    console.log(chalk.blue('Next steps:'));
    console.log(chalk.gray('1. Make sure Ollama is running: ollama serve'));
    console.log(chalk.gray('2. Pull the required model: ollama pull llama3.1:8b'));
    console.log(chalk.gray('3. Add your Google Calendar credentials to credentials.json'));
    console.log(chalk.gray('4. Update your .env file with the correct group name'));
    console.log(chalk.gray('5. Run: npm start'));
  }

  async checkEnvironment() {
    console.log(chalk.blue('🔍 Checking environment...'));
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion < 16) {
      console.log(chalk.red(`❌ Node.js ${nodeVersion} detected. Requires Node.js 16+`));
      process.exit(1);
    }
    
    console.log(chalk.green(`✅ Node.js ${nodeVersion} - OK`));
    
    // Check if package.json exists
    const packageJsonPath = path.join(this.rootDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.log(chalk.red('❌ package.json not found'));
      process.exit(1);
    }
    
    console.log(chalk.green('✅ package.json found'));
  }

  async setupEnvironmentFile() {
    console.log(chalk.blue('\n🔧 Setting up environment file...'));
    
    const envPath = path.join(this.rootDir, '.env');
    const envExamplePath = path.join(this.rootDir, 'env.example');
    
    if (fs.existsSync(envPath)) {
      console.log(chalk.yellow('⚠️  .env file already exists, skipping'));
      return;
    }
    
    if (!fs.existsSync(envExamplePath)) {
      console.log(chalk.red('❌ env.example file not found'));
      return;
    }
    
    try {
      fs.copyFileSync(envExamplePath, envPath);
      console.log(chalk.green('✅ Created .env from env.example'));
    } catch (error) {
      console.log(chalk.red('❌ Failed to create .env file:'), error.message);
    }
  }

  async checkOllama() {
    console.log(chalk.blue('\n🤖 Checking Ollama installation...'));
    
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      await execAsync('ollama --version');
      console.log(chalk.green('✅ Ollama is installed'));
      
      // Check if Ollama is running
      try {
        const axios = require('axios');
        await axios.get('http://localhost:11434/api/tags', { timeout: 3000 });
        console.log(chalk.green('✅ Ollama is running'));
        
        // Check if model exists
        try {
          const response = await axios.get('http://localhost:11434/api/tags');
          const models = response.data.models || [];
          const hasLlama = models.some(m => m.name.includes('llama3.1:8b'));
          
          if (hasLlama) {
            console.log(chalk.green('✅ llama3.1:8b model is available'));
          } else {
            console.log(chalk.yellow('⚠️  llama3.1:8b model not found'));
            console.log(chalk.gray('💡 Run: ollama pull llama3.1:8b'));
          }
        } catch (error) {
          console.log(chalk.yellow('⚠️  Could not check available models'));
        }
        
      } catch (error) {
        console.log(chalk.yellow('⚠️  Ollama is not running'));
        console.log(chalk.gray('💡 Start Ollama: ollama serve'));
      }
      
    } catch (error) {
      console.log(chalk.red('❌ Ollama is not installed'));
      console.log(chalk.gray('💡 Install from: https://ollama.ai/'));
    }
  }

  async checkGoogleCredentials() {
    console.log(chalk.blue('\n📅 Checking Google Calendar credentials...'));
    
    const credentialsPath = path.join(this.rootDir, 'credentials.json');
    
    if (fs.existsSync(credentialsPath)) {
      try {
        const credentials = JSON.parse(fs.readFileSync(credentialsPath));
        
        if (credentials.type === 'service_account') {
          console.log(chalk.green('✅ Google service account credentials found'));
        } else {
          console.log(chalk.yellow('⚠️  Credentials file exists but may not be service account'));
        }
      } catch (error) {
        console.log(chalk.red('❌ Invalid credentials.json file'));
      }
    } else {
      console.log(chalk.yellow('⚠️  credentials.json not found'));
      console.log(chalk.gray('💡 Download from Google Cloud Console:'));
      console.log(chalk.gray('   1. Go to console.cloud.google.com'));
      console.log(chalk.gray('   2. Create/select project'));
      console.log(chalk.gray('   3. Enable Google Calendar API'));
      console.log(chalk.gray('   4. Create service account'));
      console.log(chalk.gray('   5. Download JSON key as credentials.json'));
    }
  }

  async createDirectories() {
    console.log(chalk.blue('\n📁 Creating directories...'));
    
    const directories = ['logs', 'temp'];
    
    directories.forEach(dir => {
      const dirPath = path.join(this.rootDir, dir);
      
      if (!fs.existsSync(dirPath)) {
        try {
          fs.mkdirSync(dirPath, { recursive: true });
          console.log(chalk.green(`✅ Created directory: ${dir}`));
        } catch (error) {
          console.log(chalk.red(`❌ Failed to create directory ${dir}:`), error.message);
        }
      } else {
        console.log(chalk.gray(`📁 Directory ${dir} already exists`));
      }
    });
  }
}

// Run setup wizard
const wizard = new SetupWizard();
wizard.run().catch(error => {
  console.log(chalk.red('❌ Setup failed:'), error.message);
  process.exit(1);
});
