class CharacterUploader {
    async uploadCharacter(formData) {
      const response = await fetch('/admin/add', {
        method: 'POST',
        headers: {'Authorization': `Bearer ${ADMIN_TOKEN}`},
        body: formData
      });
      // Handle response
    }
  }