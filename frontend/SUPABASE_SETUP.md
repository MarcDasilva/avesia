# Supabase Setup Guide

## 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Create a new project
4. Wait for the project to be set up

## 2. Get Your Credentials

1. In your Supabase project dashboard, go to **Settings** > **API**
2. Copy your **Project URL** and **anon/public key**

## 3. Set Up Environment Variables

1. Create a `.env` file in the `frontend` directory
2. Add the following:

```
VITE_SUPABASE_URL=your-project-url-here
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Replace `your-project-url-here` and `your-anon-key-here` with your actual values from Supabase.

## 4. Enable Authentication

### Email Authentication

1. In your Supabase dashboard, go to **Authentication** > **Providers**
2. **Email** provider is enabled by default - no action needed

### Google OAuth

1. In your Supabase dashboard, go to **Authentication** > **Providers**
2. Click on **Google** provider
3. Enable the Google provider
4. You'll need to create OAuth credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Google+ API
   - Go to **Credentials** > **Create Credentials** > **OAuth client ID**
   - Choose **Web application**
   - Add authorized redirect URI: `https://your-project-ref.supabase.co/auth/v1/callback`
     (Replace `your-project-ref` with your Supabase project reference)
   - Copy the **Client ID** and **Client Secret**
   - Paste them into Supabase Google provider settings
5. Save the settings

## 5. Usage

The authentication is now set up! You can use it in your components:

```jsx
import { useAuth } from "./contexts/AuthContext";

function MyComponent() {
  const { user, signIn, signOut, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  if (!user) {
    // Show login form
    return <Auth />;
  }

  // User is logged in
  return (
    <div>
      <p>Welcome, {user.email}!</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
```

## Available Auth Methods

- `signUp(email, password, metadata)` - Create a new account with email/password
- `signIn(email, password)` - Sign in with email/password
- `signInWithGoogle()` - Sign in with Google OAuth
- `signOut()` - Sign out the current user
- `resetPassword(email)` - Send password reset email
- `updatePassword(newPassword)` - Update user password
- `user` - Current user object (null if not logged in)
- `session` - Current session object
- `loading` - Boolean indicating if auth state is loading

## Auth Component

The `Auth` component now supports both email and Google authentication:

- Email sign up/sign in form
- Google sign-in button with OAuth
- Automatic switching between sign up and sign in modes
