# Nova CI/CD Platform

An AI-powered CI/CD pipeline platform that automatically generates and deploys pipelines to AWS EC2 using Amazon Nova AI.

## Features

- **AI-Powered Pipeline Generation** - Automatically analyzes GitHub repositories and generates optimized CI/CD pipelines using Amazon Nova AI
- **GitHub Integration** - Connect your GitHub account and browse repositories
- **AWS EC2 Deployment** - One-click deployment to EC2 instances with automatic server setup
- **Modern Dashboard** - Beautiful, responsive UI with real-time metrics and activity feeds
- **Pipeline Visualization** - Interactive visualization of pipeline stages and workflows
- **MongoDB Storage** - Persistent storage of pipelines and deployment history
- **NextAuth Integration** - Secure authentication with GitHub OAuth

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **Database**: MongoDB with Mongoose ODM
- **AI**: Amazon Bedrock with Nova AI models
- **Cloud**: AWS EC2, AWS SDK v3
- **Authentication**: NextAuth.js with GitHub OAuth

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- MongoDB (local or Atlas)
- AWS Account with credentials
- GitHub OAuth App (for authentication)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/amazon_nova.git
cd amazon_nova
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Configure your `.env` file with:
   - MongoDB connection string
   - AWS credentials (see [AWS_CREDENTIALS_GUIDE.md](AWS_CREDENTIALS_GUIDE.md))
   - GitHub OAuth credentials
   - Amazon Bedrock configuration

5. Start the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## AWS Setup

This platform deploys pipelines to **your AWS account**. You need to configure:

- AWS Access Key ID
- AWS Secret Access Key
- EC2 Key Pair
- Security Group
- AMI ID (Free Tier: `ami-0440d3b780d96b29d`)

See [AWS_CREDENTIALS_GUIDE.md](AWS_CREDENTIALS_GUIDE.md) for detailed setup instructions.

## Usage

1. **Sign in** with your GitHub account
2. **Connect GitHub** on the Repositories page
3. **Browse repositories** and select one
4. **Generate pipeline** using AI analysis
5. **Deploy to EC2** with one click
6. **Access your application** via the public IP

## Project Structure

```
amazon_nova/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── (app)/       # Authenticated pages
│   │   │   ├── dashboard/
│   │   │   ├── repositories/
│   │   │   ├── pipelines/
│   │   │   └── chat/
│   │   └── api/         # API routes
│   ├── components/       # React components
│   ├── lib/             # Utilities and services
│   ├── models/          # MongoDB models
│   └── types/           # TypeScript types
├── public/              # Static assets
└── AWS_CREDENTIALS_GUIDE.md  # AWS setup guide
```

## Key Features

### AI Pipeline Generation
- Analyzes repository structure and dependencies
- Generates optimized YAML pipeline configuration
- Supports Node.js, Python, Docker, and more

### AWS EC2 Deployment
- Automatic EC2 instance provisioning
- Node.js 18 and Docker pre-installed
- Beautiful deployment confirmation page
- t3.small instance (better performance and reliability)

### Modern UI
- Dark mode support
- Responsive design
- Real-time activity feeds
- Interactive pipeline visualization
- Beautiful gradient designs

## License

**PROPRIETARY - ALL RIGHTS RESERVED**

Copyright (c) 2025. All Rights Reserved.

This software is proprietary and confidential. Unauthorized copying, distribution,
modification, or use of this software is strictly prohibited. See the [LICENSE](LICENSE)
file for complete terms and conditions.

⚠️ **NOTICE**: This code is protected by copyright law. Unauthorized use, reproduction,
or distribution may result in civil and criminal penalties.
