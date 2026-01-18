import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const { signIn, signUp, signInWithGoogle } = useAuth()

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError('')
    setMessage('')

    try {
      const { error } = await signInWithGoogle()
      if (error) throw error
    } catch (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      if (isSignUp) {
        const { error } = await signUp(email, password)
        if (error) throw error
        setMessage('Check your email to confirm your account!')
      } else {
        const { error } = await signIn(email, password)
        if (error) throw error
        setMessage('Signed in successfully!')
      }
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container" style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: '#000000',
      border: '1px solid #ffffff',
      padding: '40px',
      zIndex: 1000,
      minWidth: '300px',
    }}>
      <h2 style={{ color: '#ffffff', marginBottom: '20px', textAlign: 'center' }}>
        {isSignUp ? 'Sign Up' : 'Sign In'}
      </h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#1a1a1a',
              border: '1px solid #ffffff',
              color: '#ffffff',
              fontSize: '14px',
            }}
          />
        </div>
        <div style={{ marginBottom: '15px' }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#1a1a1a',
              border: '1px solid #ffffff',
              color: '#ffffff',
              fontSize: '14px',
            }}
          />
        </div>
        {error && (
          <div style={{ color: '#ff4444', marginBottom: '15px', fontSize: '14px' }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{ color: '#44ff44', marginBottom: '15px', fontSize: '14px' }}>
            {message}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#ffffff',
            color: '#000000',
            border: 'none',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
            marginBottom: '10px',
          }}
        >
          {loading ? 'Loading...' : isSignUp ? 'Sign Up with Email' : 'Sign In with Email'}
        </button>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '10px',
          color: '#ffffff',
          fontSize: '14px',
        }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#ffffff' }}></div>
          <span style={{ padding: '0 10px' }}>OR</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#ffffff' }}></div>
        </div>
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#4285f4',
            color: '#ffffff',
            border: 'none',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
            marginBottom: '15px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.20454Z"
              fill="#4285F4"
            />
            <path
              d="M9 18C11.43 18 13.467 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65454 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z"
              fill="#34A853"
            />
            <path
              d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40681 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54772 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65454 3.57955 9 3.57955Z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </button>
        <button
          type="button"
          onClick={() => {
            setIsSignUp(!isSignUp)
            setError('')
            setMessage('')
          }}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: 'transparent',
            color: '#ffffff',
            border: '1px solid #ffffff',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
        </button>
      </form>
    </div>
  )
}

