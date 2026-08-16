import React, { useState } from 'react';
import { axiosInstance } from '../../api/axiosInstance';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export const CreateUserModal = ({ isOpen, onClose, onSuccess }: { isOpen: boolean, onClose: () => void, onSuccess: () => void }) => {
  const [formData, setFormData] = useState({
    fullName: '', email: '', username: '', mobile: '', ministryId: '', departmentId: '', tempPassword: ''
  });
  
  const queryClient = useQueryClient();

  const createUserMutation = useMutation({
    mutationFn: async (data: any) => {
      // The API requires role and designation. We set default to 'PM' since that's what we usually provision here
      const payload = { ...data, role: 'PM', designation: 'Project Manager' };
      const response = await axiosInstance.post('/users', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSuccess();
      onClose();
    },
    onError: (error) => {
      console.error('Failed to create user:', error);
      alert('Failed to create user. Please try again.');
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate(formData);
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', width: '400px' }}>
        <h2>Create New User</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input required placeholder="Full Name" onChange={e => setFormData({...formData, fullName: e.target.value})} />
          <input required type="email" placeholder="Email" onChange={e => setFormData({...formData, email: e.target.value})} />
          <input required placeholder="Username" onChange={e => setFormData({...formData, username: e.target.value})} />
          <input required type="password" placeholder="Temp Password" onChange={e => setFormData({...formData, tempPassword: e.target.value})} />
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" onClick={onClose} disabled={createUserMutation.isPending}>Cancel</button>
            <button type="submit" disabled={createUserMutation.isPending}>{createUserMutation.isPending ? 'Creating...' : 'Create User'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};