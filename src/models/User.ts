import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
    email: string;
    password?: string;
    name?: string;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema: Schema = new Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
        },
        password: {
            type: String,
        },
        name: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

// Prevent mongoose from compiling the model multiple times in development
export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
