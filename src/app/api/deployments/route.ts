import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/mongodb';
import Deployment from '@/models/Deployment';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await dbConnect();

    const deployments = await Deployment.find({
      userId: session.user.email || session.user.id,
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ deployments });
  } catch (error: any) {
    console.error('Failed to fetch deployments:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch deployments' },
      { status: 500 }
    );
  }
}
